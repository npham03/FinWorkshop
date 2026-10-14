import json

from odoo import fields, models


ENTITY_LABELS = [
    ("branches", "Chi nhánh"),
    ("cash-accounts", "Tài khoản tiền"),
    ("customers", "Khách hàng"),
    ("suppliers", "Nhà cung cấp"),
    ("materials", "Vật tư"),
    ("products", "Sản phẩm"),
    ("boms", "Định mức BOM"),
    ("quotations", "Báo giá"),
    ("production-orders", "Lệnh sản xuất"),
    ("stock-movements", "Phiếu kho"),
    ("labor-logs", "Nhật ký nhân công"),
    ("transactions", "Giao dịch tiền"),
    ("invoices", "Hóa đơn"),
    ("payments", "Thanh toán"),
    ("payment-allocations", "Phân bổ thanh toán"),
    ("reconciliations", "Đối soát"),
    ("alerts", "Cảnh báo"),
    ("classification-rules", "Quy tắc phân loại"),
    ("tax-rules", "Quy tắc thuế"),
    ("tax-periods", "Kỳ thuế"),
    ("users", "Người dùng FinTax"),
    ("role-permissions", "Phân quyền FinTax"),
    ("audit-logs", "Nhật ký kiểm toán"),
    ("file-assets", "Tệp đính kèm"),
]


class FinTaxSyncRecord(models.Model):
    _name = "fintax.sync.record"
    _description = "FinTax synchronized web record"
    _order = "synced_at desc, id desc"
    _rec_name = "name"

    name = fields.Char(required=True, index=True, readonly=True)
    entity = fields.Selection(ENTITY_LABELS, required=True, index=True, readonly=True)
    source_id = fields.Char(required=True, index=True, readonly=True)
    source_key = fields.Char(required=True, index=True, readonly=True, copy=False)
    reference = fields.Char(index=True, readonly=True)
    status = fields.Char(index=True, readonly=True)
    event_date = fields.Date(index=True, readonly=True)
    amount = fields.Float(digits=(16, 2), readonly=True)
    counterparty = fields.Char(index=True, readonly=True)
    payload_json = fields.Text(required=True, readonly=True)
    source_created_at = fields.Char(readonly=True)
    synced_at = fields.Datetime(required=True, readonly=True, index=True)
    native_model = fields.Char(readonly=True)
    native_id = fields.Integer(readonly=True)
    file_content = fields.Binary(attachment=True, readonly=True)
    file_filename = fields.Char(readonly=True)

    _sql_constraints = [
        ("source_key_unique", "unique(source_key)", "This FinTax source record is already synchronized."),
    ]

    @staticmethod
    def json_text(payload):
        return json.dumps(payload, ensure_ascii=False, indent=2, default=str)
