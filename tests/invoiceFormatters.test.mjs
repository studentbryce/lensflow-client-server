import test from "node:test";
import assert from "node:assert/strict";
import {
    formatInvoiceCurrency,
    formatInvoiceDate,
    formatInvoiceTime,
    formatInvoiceStatus,
    getInvoiceClientName,
} from "../src/components/invoices/invoiceFormatters.js";

test("invoice formatting helpers remain available as pure functions", () => {
    assert.equal(formatInvoiceCurrency(12.5), new Intl.NumberFormat("en-NZ", {style:"currency",currency:"NZD"}).format(12.5));
    assert.equal(formatInvoiceDate(null), "—");
    assert.equal(formatInvoiceTime(null), "—");
    assert.equal(formatInvoiceStatus("paid"), "Paid");
    assert.equal(getInvoiceClientName({first_name:"Ada",last_name:"Lovelace"}), "Ada Lovelace");
});
