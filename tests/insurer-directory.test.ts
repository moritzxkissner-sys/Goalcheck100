import assert from "node:assert/strict";
import test from "node:test";
import {
  filterInsurerContacts,
  INSURER_CONTACTS,
} from "../lib/insurer-directory";

test("directory search matches names, cities, and contact details", () => {
  assert.deepEqual(
    filterInsurerContacts(INSURER_CONTACTS, "koeln axa", "all").map(
      (contact) => contact.id,
    ),
    ["axa-sach"],
  );
  assert.deepEqual(
    filterInsurerContacts(INSURER_CONTACTS, "service@ergo.de", "all").map(
      (contact) => contact.id,
    ),
    ["ergo-sach"],
  );
});

test("contact filters only include recorded contact methods", () => {
  assert.equal(
    filterInsurerContacts(INSURER_CONTACTS, "Allianz", "email").length,
    0,
  );
  assert.deepEqual(
    filterInsurerContacts(INSURER_CONTACTS, "generali", "email").map(
      (contact) => contact.id,
    ),
    ["generali-sach"],
  );
  assert.equal(
    filterInsurerContacts(INSURER_CONTACTS, "generali", "phone").length,
    0,
  );
});
