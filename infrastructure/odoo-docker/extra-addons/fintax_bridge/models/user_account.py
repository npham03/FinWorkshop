from odoo import api, fields, models


class FinTaxUserAccount(models.Model):
    _name = "fintax.user.account"
    _description = "FinTax application account"
    _rec_name = "email"
    _order = "create_date desc, id desc"

    source_id = fields.Char(required=True, index=True, copy=False)
    email = fields.Char(required=True, index=True, copy=False)
    name = fields.Char(required=True)
    role = fields.Selection(
        [
            ("OWNER", "Chủ xưởng"),
            ("ACCOUNTANT", "Kế toán / Bán hàng"),
            ("WORKSHOP", "Thủ kho / Thợ xưởng"),
        ],
        required=True,
        default="ACCOUNTANT",
    )
    password_hash = fields.Char(required=True, copy=False, groups="base.group_system")
    is_approved = fields.Boolean(default=False, index=True)
    reset_token_hash = fields.Char(index=True, copy=False, groups="base.group_system")
    reset_token_expires_at = fields.Datetime(copy=False, groups="base.group_system")

    _sql_constraints = [
        ("source_id_unique", "unique(source_id)", "This FinTax account already exists."),
        ("email_unique", "unique(email)", "This email is already registered."),
    ]

    @api.model
    def consume_password_reset(self, token_hash, password_hash):
        account = self.search(
            [("reset_token_hash", "=", token_hash)],
            limit=1,
        )
        if not account or not account.reset_token_expires_at:
            return False
        if account.reset_token_expires_at <= fields.Datetime.now():
            return False
        account.write({
            "password_hash": password_hash,
            "reset_token_hash": False,
            "reset_token_expires_at": False,
        })
        return {
            "source_id": account.source_id,
            "email": account.email,
            "name": account.name,
            "role": account.role,
            "is_approved": account.is_approved,
        }
