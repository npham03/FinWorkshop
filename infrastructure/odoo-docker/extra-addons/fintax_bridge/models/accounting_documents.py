from odoo import fields, models
from odoo.exceptions import ValidationError


class SaleOrder(models.Model):
    _inherit = "sale.order"

    fintax_source_key = fields.Char(index=True, copy=False, readonly=True)

    _sql_constraints = [
        ("fintax_source_key_unique", "unique(fintax_source_key)", "This FinTax quotation is already synchronized."),
    ]


class AccountMove(models.Model):
    _inherit = "account.move"

    fintax_source_key = fields.Char(index=True, copy=False, readonly=True)

    _sql_constraints = [
        ("fintax_source_key_unique", "unique(fintax_source_key)", "This FinTax invoice is already synchronized."),
    ]

    def fintax_cancel_invoice(self):
        for move in self:
            lines = move.line_ids.filtered(lambda line: line.account_id.reconcile)
            partials = lines.matched_debit_ids | lines.matched_credit_ids
            if partials.filtered(lambda partial: not partial.fintax_source_key):
                raise ValidationError("Invoice has reconciliations outside FinTax. Review these in Odoo before cancellation.")
            partials.unlink()
            if move.state == "posted":
                move.button_draft()
            if move.state != "cancel":
                move.button_cancel()
        return True

    def fintax_sync_adjustment(self, payload):
        self.ensure_one()
        source_key = payload["sourceKey"]
        move = self.search([("fintax_source_key", "=", source_key)], limit=1)
        if payload.get("status") == "CANCELLED":
            if move:
                move.fintax_cancel_invoice()
            return move.id or False
        if move and move.state == "posted":
            return move.id
        journal = self.env["account.journal"].search([("company_id", "=", self.company_id.id), ("type", "=", "general")], limit=1)
        if not journal:
            raise ValidationError("Configure a general journal for FinTax adjustments.")
        partner = self.commercial_partner_id
        payable = self.move_type == "in_invoice"
        debt_account = partner.property_account_payable_id if payable else partner.property_account_receivable_id

        def mapped_account(parameter, account_type, names):
            account_id = self.env["ir.config_parameter"].sudo().get_param(parameter)
            account = self.env["account.account"].browse(int(account_id)).exists() if account_id else self.env["account.account"].search([("company_id", "=", self.company_id.id), ("account_type", "=", account_type), ("name", "in", names)], limit=1)
            if not account or account.company_id != self.company_id:
                raise ValidationError("Configure Odoo account mapping: %s" % parameter)
            return account

        adjustment = float(payload.get("discountAmount", 0)) + float(payload.get("roundingAdjustment", 0))
        fee = float(payload.get("bankFeeAmount", 0))
        date = payload.get("date") or self.invoice_date or fields.Date.context_today(self)
        currency = self.currency_id
        lines = []

        def line(account, signed_amount, name, partner_id=False):
            balance = currency._convert(signed_amount, self.company_currency_id, self.company_id, date)
            return (0, 0, {"account_id": account.id, "partner_id": partner_id, "name": name,
                           "currency_id": currency.id, "amount_currency": signed_amount,
                           "debit": max(balance, 0), "credit": max(-balance, 0)})

        if adjustment:
            is_expense = (not payable and adjustment > 0) or (payable and adjustment < 0)
            expense_account = mapped_account("fintax.writeoff_expense_account_id" if is_expense else "fintax.writeoff_income_account_id",
                                             "expense" if is_expense else "income", ["Cash Discount Loss", "Cash Difference Loss"] if is_expense else ["Cash Discount Gain", "Cash Difference Gain"])
            debt_amount = adjustment if payable else -adjustment
            lines.extend([line(debt_account, debt_amount, payload.get("writeOffReason", "FinTax write-off"), partner.id),
                          line(expense_account, -debt_amount, "FinTax settlement difference")])
        if fee:
            expense_account = mapped_account("fintax.bank_fee_account_id", "expense", ["Bank Fees"])
            liquidity = self.env["account.journal"].search([("company_id", "=", self.company_id.id), ("type", "=", "bank")], limit=1).default_account_id
            if not liquidity:
                raise ValidationError("Configure a bank journal liquidity account.")
            lines.extend([line(expense_account, fee, "FinTax bank fee"), line(liquidity, -fee, "FinTax bank fee")])
        values = {"fintax_source_key": source_key, "move_type": "entry", "journal_id": journal.id,
                  "date": date, "currency_id": currency.id, "ref": payload.get("writeOffReason") or source_key,
                  "line_ids": [(5, 0, 0)] + lines}
        if move:
            if move.state != "draft":
                raise ValidationError("Adjustment is cancelled; create a new allocation.")
            move.write(values)
        else:
            move = self.create(values)
        return move.id

    def fintax_sync_allocation(self, payment_id, payload):
        self.ensure_one()
        partial_model = self.env["account.partial.reconcile"]
        source_key = payload["sourceKey"]
        existing = partial_model.search([("fintax_source_key", "in", [source_key, source_key + ":adjustment"])])
        if payload.get("status") in ("UNALLOCATED", "CANCELLED"):
            existing.unlink()
            return True
        payment = self.env["account.payment"].browse(payment_id).exists()
        if self.state != "posted" or not payment or payment.move_id.state != "posted":
            raise ValidationError("Post the invoice and payment in Odoo before reconciliation.")
        debt_lines = self.line_ids.filtered(lambda line: line.account_id.account_type in ("asset_receivable", "liability_payable"))
        if len(debt_lines) != 1:
            raise ValidationError("FinTax automatic allocation requires one invoice maturity line.")
        invoice_line = debt_lines[0]

        def allocate(other_lines, amount, key):
            if partial_model.search_count([("fintax_source_key", "=", key)]):
                return
            candidates = other_lines.filtered(lambda line: line.account_id == invoice_line.account_id and line.partner_id == invoice_line.partner_id)
            if len(candidates) != 1 or candidates.currency_id != invoice_line.currency_id:
                raise ValidationError("Payment/adjustment account, partner or currency does not match the invoice.")
            other = candidates[0]
            debit, credit = (invoice_line, other) if invoice_line.balance > 0 else (other, invoice_line)
            company_amount = self.currency_id._convert(amount, self.company_currency_id, self.company_id, payload.get("date") or self.invoice_date)
            if company_amount > min(abs(debit.amount_residual), abs(credit.amount_residual)) + self.company_currency_id.rounding / 2:
                raise ValidationError("Odoo residual is smaller than the requested allocation.")
            partial_model.create({"fintax_source_key": key, "debit_move_id": debit.id, "credit_move_id": credit.id,
                                  "amount": company_amount, "debit_amount_currency": amount, "credit_amount_currency": amount})

        allocate(payment.move_id.line_ids, float(payload["allocatedAmount"]), source_key)
        difference = float(payload.get("discountAmount", 0)) + float(payload.get("roundingAdjustment", 0))
        if difference > 0:
            adjustment = self.search([("fintax_source_key", "=", "accounting-adjustments:" + str(payload.get("adjustmentId", "")))], limit=1)
            if not adjustment or adjustment.state != "posted":
                raise ValidationError("Post the settlement adjustment before completing reconciliation.")
            allocate(adjustment.line_ids, difference, source_key + ":adjustment")
        elif difference < 0:
            raise ValidationError("Negative settlement adjustments require manual review in Odoo.")
        return True


class AccountPartialReconcile(models.Model):
    _inherit = "account.partial.reconcile"

    fintax_source_key = fields.Char(index=True, copy=False, readonly=True)
    _sql_constraints = [
        ("fintax_partial_source_unique", "unique(fintax_source_key)", "This FinTax allocation is already reconciled."),
    ]


class AccountPayment(models.Model):
    _inherit = "account.payment"

    fintax_source_key = fields.Char(index=True, copy=False, readonly=True)

    _sql_constraints = [
        ("fintax_source_key_unique", "unique(fintax_source_key)", "This FinTax payment is already synchronized."),
    ]
