/**
 * Canonical field taxonomy for Smart Form Filler.
 *
 * Every real-world form field the extension can recognize is mapped to one
 * canonical key. Each entry lists synonyms (English + common Hindi/Gujarati
 * phrasing seen on Indian govt/scholarship/admission forms) used to match
 * a field's label/name/id/placeholder text against this taxonomy.
 *
 * NOTE: The Hindi/Gujarati entries are a starting seed, not an exhaustive
 * linguistic dictionary — regional forms vary a lot in phrasing/spelling.
 * Treat this list as something to keep growing (see README "Growing the
 * dictionary"). It's intentionally conservative: better to miss a field
 * (falls back to the learning engine) than to mismatch one.
 */

const CANONICAL_FIELDS = {
  // ---- Personal ----
  full_name: { category: "Personal", label: "Full Name", sensitive: false,
    synonyms: ["full name", "candidate name", "applicant name", "student name", "name of candidate",
      "name of the candidate", "your name", "name", "name as per aadhaar", "name (in block letters)",
      "naam", "नाम", "पूरा नाम", "अभ्यर्थी का नाम", "विद्यार्थी का नाम", "उम्मीदवार का नाम",
      "નામ", "ઉમેદવારનું નામ", "વિદ્યાર્થીનું નામ"] },
  first_name: { category: "Personal", label: "First Name", sensitive: false,
    synonyms: ["first name", "given name", "फर्स्ट नेम", "प्रथम नाम"] },
  last_name: { category: "Personal", label: "Last Name", sensitive: false,
    synonyms: ["last name", "surname", "family name", "उपनाम", "सरनेम"] },
  father_name: { category: "Personal", label: "Father's Name", sensitive: false,
    synonyms: ["father's name", "fathers name", "father name", "name of father", "guardian name (father)",
      "pita ka naam", "पिता का नाम", "पिताजी का नाम", "पिता जी का नाम", "પિતાનું નામ"] },
  mother_name: { category: "Personal", label: "Mother's Name", sensitive: false,
    synonyms: ["mother's name", "mothers name", "mother name", "name of mother",
      "माता का नाम", "मां का नाम", "માતાનું નામ"] },
  dob: { category: "Personal", label: "Date of Birth", sensitive: false,
    synonyms: ["date of birth", "dob", "d.o.b", "d.o.b.", "birth date", "date of birth (dd/mm/yyyy)",
      "जन्म तिथि", "जन्मतिथि", "जन्म की तारीख", "જન્મ તારીખ"] },
  gender: { category: "Personal", label: "Gender", sensitive: false,
    synonyms: ["gender", "sex", "लिंग", "जेंडर", "લિંગ"] },
  email: { category: "Personal", label: "Email", sensitive: false,
    synonyms: ["email", "email address", "e-mail", "e-mail id", "email id", "ईमेल", "इमेल", "ईमेल पता", "ઈમેલ"] },
  phone: { category: "Personal", label: "Mobile Number", sensitive: false,
    synonyms: ["mobile", "mobile number", "phone", "phone number", "contact number", "cell number",
      "registered mobile number", "मोबाइल नंबर", "फ़ोन नंबर", "संपर्क नंबर", "મોબાઈલ નંબર"] },
  alt_phone: { category: "Personal", label: "Alternate Phone", sensitive: false,
    synonyms: ["alternate mobile", "alternate mobile number", "alternate phone number",
      "secondary contact number", "whatsapp number"] },

  // ---- Address ----
  address_line1: { category: "Address", label: "Address", sensitive: false,
    synonyms: ["address", "residential address", "permanent address", "present address", "address line 1",
      "correspondence address", "पता", "स्थायी पता", "वर्तमान पता", "સરનામું", "કાયમી સરનામું"] },
  address_line2: { category: "Address", label: "Address Line 2", sensitive: false,
    synonyms: ["address line 2", "local address", "area/locality", "landmark"] },
  city: { category: "Address", label: "City", sensitive: false,
    synonyms: ["city", "town", "city/town", "शहर", "शहर/कस्बा", "શહેર"] },
  district: { category: "Address", label: "District", sensitive: false,
    synonyms: ["district", "जिला", "જિલ્લો"] },
  state: { category: "Address", label: "State", sensitive: false,
    synonyms: ["state", "राज्य", "રાજ્ય"] },
  pincode: { category: "Address", label: "PIN Code", sensitive: false,
    synonyms: ["pincode", "pin code", "postal code", "zip code", "पिन कोड", "पिनकोड", "પિન કોડ"] },
  country: { category: "Address", label: "Country", sensitive: false,
    synonyms: ["country", "देश", "દેશ"] },

  // ---- Identity / Category ----
  category: { category: "Identity", label: "Category", sensitive: false,
    synonyms: ["category", "caste category", "social category", "category (general/obc/sc/st/ews)",
      "जाति", "श्रेणी", "जाति श्रेणी", "જાતિ", "શ્રેણી"] },
  religion: { category: "Identity", label: "Religion", sensitive: false,
    synonyms: ["religion", "धर्म", "ધર્મ"] },
  nationality: { category: "Identity", label: "Nationality", sensitive: false,
    synonyms: ["nationality", "राष्ट्रीयता", "રાષ્ટ્રીયતા"] },
  aadhaar_number: { category: "Identity", label: "Aadhaar Number", sensitive: true,
    synonyms: ["aadhaar number", "aadhar number", "aadhaar no", "aadhar no", "uid number",
      "आधार नंबर", "आधार संख्या", "આધાર નંબર"] },
  pan_number: { category: "Identity", label: "PAN Number", sensitive: true,
    synonyms: ["pan number", "pan card number", "permanent account number", "पैन नंबर", "પાન નંબર"] },

  // ---- Financial ----
  annual_income: { category: "Financial", label: "Annual Family Income", sensitive: false,
    synonyms: ["annual income", "family annual income", "total family income", "annual family income",
      "वार्षिक आय", "पारिवारिक वार्षिक आय", "વાર્ષિક આવક", "પરિવારની વાર્ષિક આવક"] },
  bank_account_number: { category: "Financial", label: "Bank Account Number", sensitive: true,
    synonyms: ["bank account number", "account number", "a/c number", "बैंक खाता संख्या", "ખાતા નંબર"] },
  ifsc_code: { category: "Financial", label: "IFSC Code", sensitive: true,
    synonyms: ["ifsc", "ifsc code", "bank ifsc code"] },
  bank_name: { category: "Financial", label: "Bank Name", sensitive: false,
    synonyms: ["bank name", "name of bank", "बैंक का नाम", "બેંકનું નામ"] },
  bank_branch: { category: "Financial", label: "Bank Branch", sensitive: false,
    synonyms: ["branch name", "bank branch", "शाखा का नाम"] },

  // ---- Education ----
  tenth_board: { category: "Education", label: "10th Board", sensitive: false,
    synonyms: ["10th board", "secondary board", "board of 10th", "ssc board", "matriculation board"] },
  tenth_marks: { category: "Education", label: "10th Marks / %", sensitive: false,
    synonyms: ["10th marks", "10th percentage", "ssc marks", "matriculation marks", "10th marksheet",
      "secondary marks", "tenth percentage", "10th marks (%)"] },
  tenth_year: { category: "Education", label: "10th Passing Year", sensitive: false,
    synonyms: ["10th passing year", "year of passing 10th", "ssc year", "10th year of passing"] },
  twelfth_board: { category: "Education", label: "12th Board", sensitive: false,
    synonyms: ["12th board", "higher secondary board", "hsc board", "intermediate board"] },
  twelfth_marks: { category: "Education", label: "12th Marks / %", sensitive: false,
    synonyms: ["12th marks", "12th percentage", "hsc marks", "intermediate marks", "twelfth percentage",
      "12th marks (%)"] },
  twelfth_year: { category: "Education", label: "12th Passing Year", sensitive: false,
    synonyms: ["12th passing year", "hsc year", "12th year of passing"] },
  graduation_degree: { category: "Education", label: "Degree / Course", sensitive: false,
    synonyms: ["degree", "course name", "graduation degree", "program name", "stream", "branch/stream"] },
  college_name: { category: "Education", label: "College Name", sensitive: false,
    synonyms: ["college name", "institute name", "name of college", "name of institution",
      "कॉलेज का नाम", "કોલેજનું નામ"] },
  university_name: { category: "Education", label: "University Name", sensitive: false,
    synonyms: ["university name", "name of university", "affiliated university"] },
  roll_number: { category: "Education", label: "Roll / Enrollment Number", sensitive: false,
    synonyms: ["roll number", "roll no", "enrollment number", "enrollment no", "registration number",
      "reg number", "हॉल टिकट नंबर", "पंजीकरण संख्या", "નોંધણી નંબર"] },
  guardian_occupation: { category: "Education", label: "Parent/Guardian Occupation", sensitive: false,
    synonyms: ["occupation of father", "guardian occupation", "father's occupation", "parent occupation",
      "अभिभावक का व्यवसाय"] },

  // ---- Documents (file uploads) ----
  photo: { category: "Documents", label: "Photograph", sensitive: false, type: "file",
    synonyms: ["photo", "photograph", "recent photograph", "passport size photo", "passport photo",
      "upload photo", "candidate photo", "फोटो", "फोटोग्राफ", "ફોટો"] },
  signature: { category: "Documents", label: "Signature", sensitive: false, type: "file",
    synonyms: ["signature", "upload signature", "scanned signature", "candidate signature",
      "हस्ताक्षर", "सिग्नेचर", "સહી"] },
  id_proof: { category: "Documents", label: "ID Proof (Aadhaar/Passport)", sensitive: true, type: "file",
    synonyms: ["aadhaar card", "id proof", "identity proof", "upload aadhaar", "upload id proof",
      "आधार कार्ड अपलोड", "आधार कार्ड की प्रति"] },
  category_certificate: { category: "Documents", label: "Category/Caste Certificate", sensitive: false, type: "file",
    synonyms: ["caste certificate", "category certificate", "upload caste certificate",
      "जाति प्रमाण पत्र", "श्रेणी प्रमाण पत्र"] },
  income_certificate: { category: "Documents", label: "Income Certificate", sensitive: false, type: "file",
    synonyms: ["income certificate", "upload income certificate", "आय प्रमाण पत्र"] },
  marksheet_10th: { category: "Documents", label: "10th Marksheet", sensitive: false, type: "file",
    synonyms: ["10th marksheet", "upload 10th marksheet", "ssc marksheet", "10th mark sheet upload"] },
  marksheet_12th: { category: "Documents", label: "12th Marksheet", sensitive: false, type: "file",
    synonyms: ["12th marksheet", "upload 12th marksheet", "hsc marksheet", "12th mark sheet upload"] },
  resume: { category: "Documents", label: "Resume / CV", sensitive: false, type: "file",
    synonyms: ["resume", "cv", "upload resume", "upload cv", "curriculum vitae"] },
};

// Sensitive canonical fields get an extra confirm step before autofill.
const SENSITIVE_FIELDS = Object.keys(CANONICAL_FIELDS).filter(k => CANONICAL_FIELDS[k].sensitive);
// File-type canonical fields (photo, signature, certificates...) are stored/filled differently from text.
const FILE_FIELDS = Object.keys(CANONICAL_FIELDS).filter(k => CANONICAL_FIELDS[k].type === "file");

if (typeof module !== "undefined" && module.exports) {
  module.exports = { CANONICAL_FIELDS, SENSITIVE_FIELDS, FILE_FIELDS };
} else {
  self.CANONICAL_FIELDS = CANONICAL_FIELDS;
  self.SENSITIVE_FIELDS = SENSITIVE_FIELDS;
  self.FILE_FIELDS = FILE_FIELDS;
}
