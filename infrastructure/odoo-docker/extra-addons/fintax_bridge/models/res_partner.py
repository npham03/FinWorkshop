from odoo import fields, models


class ResPartner(models.Model):
    _inherit = "res.partner"

    fintax_source_key = fields.Char(index=True, copy=False, readonly=True)

    _sql_constraints = [
        ("fintax_source_key_unique", "unique(fintax_source_key)", "This FinTax partner is already synchronized."),
    ]
