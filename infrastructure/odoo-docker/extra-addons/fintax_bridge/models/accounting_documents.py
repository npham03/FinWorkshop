from odoo import fields, models


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


class AccountPayment(models.Model):
    _inherit = "account.payment"

    fintax_source_key = fields.Char(index=True, copy=False, readonly=True)

    _sql_constraints = [
        ("fintax_source_key_unique", "unique(fintax_source_key)", "This FinTax payment is already synchronized."),
    ]
