{
    "name": "FinTax Integration",
    "summary": "Read-only mirror of FinTax web application records",
    "version": "16.0.1.0.0",
    "category": "Accounting",
    "license": "LGPL-3",
    "depends": ["contacts", "product"],
    "data": [
        "security/ir.model.access.csv",
        "views/sync_record_views.xml",
    ],
    "application": True,
    "installable": True,
}
