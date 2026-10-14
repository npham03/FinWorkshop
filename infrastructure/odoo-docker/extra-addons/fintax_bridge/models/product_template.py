from odoo import fields, models


class ProductTemplate(models.Model):
    _inherit = "product.template"

    fintax_source_key = fields.Char(index=True, copy=False, readonly=True)

    _sql_constraints = [
        ("fintax_source_key_unique", "unique(fintax_source_key)", "This FinTax product is already synchronized."),
    ]
