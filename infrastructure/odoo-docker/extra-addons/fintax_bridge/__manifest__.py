{
    "name": "FinTax Integration",
    "summary": "FinTax accounts, record mirror, and native Sales/Invoicing links",
    "version": "16.0.1.2.0",
    "category": "Accounting",
    "license": "LGPL-3",
    "depends": ["contacts", "mail", "product", "sale_management", "account"],
    "data": [
        "security/ir.model.access.csv",
        "views/sync_record_views.xml",
    ],
    "application": True,
    "installable": True,
}
