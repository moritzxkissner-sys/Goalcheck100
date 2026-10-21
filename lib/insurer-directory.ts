export type InsurerContact = {
  id: string;
  name: string;
  address: string[];
  phone?: string;
  email?: string;
  source: string;
};

// Company-published contact/imprint pages, checked on 2026-10-21.
// The address is the general contact address for the named legal entity.
export const INSURER_CONTACTS: InsurerContact[] = [
  {
    id: "allianz-sach",
    name: "Allianz Versicherungs-AG",
    address: ["Allianz Versicherungs-AG", "10900 Berlin"],
    source:
      "https://www.allianz.de/recht-und-eigentum/tierhalterhaftpflicht/kuendigen-wechseln/",
  },
  {
    id: "axa-sach",
    name: "AXA Versicherung AG",
    address: ["AXA Versicherung AG", "51171 Köln"],
    phone: "0800 3203205",
    email: "service@axa.de",
    source: "https://www.axa.de/kontakt/adressen",
  },
  {
    id: "huk",
    name: "HUK-COBURG",
    address: ["HUK-COBURG", "96444 Coburg"],
    phone: "09561 960",
    email: "info@huk-coburg.de",
    source: "https://www.huk.de/impressum.html",
  },
  {
    id: "ergo-sach",
    name: "ERGO Versicherung AG",
    address: ["ERGO Versicherung AG", "ERGO-Platz 1", "40477 Düsseldorf"],
    phone: "0800 3746 095",
    email: "service@ergo.de",
    source: "https://www.ergo.de/de/Service/Kontakt",
  },
  {
    id: "devk-sach",
    name: "DEVK Allgemeine Versicherungs-AG",
    address: [
      "DEVK Allgemeine Versicherungs-AG",
      "Riehler Straße 190",
      "50735 Köln",
    ],
    phone: "0800 4-757-757",
    email: "info@devk.de",
    source: "https://www.devk.de/impressum",
  },
  {
    id: "generali-sach",
    name: "Generali Deutschland Versicherung AG",
    address: [
      "Generali Deutschland Versicherung AG",
      "Adenauerring 7",
      "81737 München",
    ],
    email: "service@generali.de",
    source: "https://www.generali.de/service-kontakt/kontakt",
  },
  {
    id: "cosmos-sach",
    name: "Cosmos Versicherung AG",
    address: [
      "Cosmos Versicherung AG",
      "Halbergstraße 50-60",
      "66121 Saarbrücken",
    ],
    phone: "0681 966-6666",
    email: "info@cosmosdirekt.de",
    source:
      "https://www.cosmosdirekt.de/resource/blob/730338/38a563cb000805c050bf192a2b461c25/geschaeftsbericht-2025-versicherung-data.pdf",
  },
];

export const INSURER_CONTACTS_VERIFIED_ON = "2026-10-21";
