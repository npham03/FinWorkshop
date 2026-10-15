{
    "name": "FinTax Integration",
    "summary": "FinTax accounts and read-only mirror of application records",
    "version": "16.0.1.1.0",
    "category": "Accounting",
    "license": "LGPL-3",
    "depends": ["contacts", "mail", "product"],
    "data": [
        "security/ir.model.access.csv",
        "views/sync_record_views.xml",
    ],
    "application": True,
    "installable": True,
}
