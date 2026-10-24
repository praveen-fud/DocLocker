// The profile details counted on each page of "Your details", and the few
// a lender can't start without. Optional extras (test scores, CIBIL, the
// second reference…) are left out of the count so 100% stays reachable.
export const PROFILE_PAGES = [
  {
    id: 1,
    label: "Identity & education",
    keys: [
      "firstName", "lastName", "phone", "email", "dob", "gender", "nationality", "placeOfBirth",
      "passportNumber", "passportIssueDate", "passportExpiry", "aadhaarNumber", "panNumber", "marital",
      "loanAmount", "qualName", "qualYear", "qualInstitution",
      "pct10Score", "pct10Year", "pct12Score", "pct12Year", "pctGradScore", "pctGradYear", "hasBacklogs",
    ],
  },
  {
    id: 2,
    label: "Study plans & address",
    keys: ["loanTrack", "destinationCountry", "targetUniversity", "courseNameUniversity", "i20Received", "visaBooked", "currentAddress", "permanentAddress"],
  },
  {
    id: 3,
    label: "Family & guarantor",
    keys: ["fatherName", "fatherContact", "motherName", "motherContact"],
  },
  {
    id: 4,
    label: "Background",
    keys: ["priorBankApplied", "ownHouseStatus", "hasJobDetails"],
  },
  {
    id: 5,
    label: "References",
    keys: ["ref1_name", "ref1_mobile", "ref1_relation", "ref1_city", "ref2_name", "ref2_mobile", "ref2_relation", "ref2_city"],
  },
];

// Needed before the application can be submitted.
export const REQUIRED_DETAILS = [
  { key: "firstName", label: "First name", page: 1 },
  { key: "lastName", label: "Last name", page: 1 },
  { key: "dob", label: "Date of birth", page: 1 },
  { key: "gender", label: "Gender", page: 1 },
  { key: "loanAmount", label: "Loan amount", page: 1 },
  { key: "destinationCountry", label: "Destination country", page: 2 },
  { key: "courseNameUniversity", label: "Course & university", page: 2 },
  { key: "currentAddress", label: "Present address", page: 2 },
  { key: "fatherName", label: "Father’s name", page: 3 },
  { key: "motherName", label: "Mother’s name", page: 3 },
  { key: "ref1_name", label: "Reference 1 name", page: 5 },
  { key: "ref1_mobile", label: "Reference 1 mobile", page: 5 },
];

const filled = (v) => v !== undefined && v !== null && String(v).trim() !== "";

export function pageProgress(info, page) {
  const done = page.keys.filter((k) => filled(info[k])).length;
  return { done, total: page.keys.length };
}

export function profileProgress(info = {}) {
  const pages = PROFILE_PAGES.map((p) => ({ ...p, ...pageProgress(info, p) }));
  const done = pages.reduce((a, p) => a + p.done, 0);
  const total = pages.reduce((a, p) => a + p.total, 0);
  const missingRequired = REQUIRED_DETAILS.filter((d) => !filled(info[d.key]));
  return { pages, done, total, missingRequired };
}

export const percent = (done, total) => (total > 0 ? Math.round((done / total) * 100) : 0);
