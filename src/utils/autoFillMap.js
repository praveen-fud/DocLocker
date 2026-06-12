const SOURCE_LABELS = {
  aadhaar:    'Aadhar',
  pan:        'PAN Card',
  passport:   'Passport',
  '10th':     '10th Marksheet',
  '12th':     '12th Marksheet',
  degree:     'Degree Certificate',
  diploma:    'Diploma Marksheet',
  pc:         'Provisional Certificate',
  gre:        'GRE Scorecard',
  ielts:      'IELTS Report',
  toefl:      'TOEFL Report',
  duolingo:   'Duolingo Certificate',
  i20:        'I-20 / Admission Letter',
  visa_letter:'Visa Letter',
  cibil:      'CIBIL Report',
};

export function getDocSourceLabel(type) {
  return SOURCE_LABELS[type] || type;
}

export function extractPersonalAutoFill(type, fields) {
  const result = {};

  switch (type) {
    case 'aadhaar':
      if (fields['Name'])    result.fullName = fields['Name'];
      if (fields['Address']) { result.currentAddress = fields['Address']; result.permanentAddress = fields['Address']; }
      break;

    case 'pan':
      if (fields['Name'])           result.fullName   = fields['Name'];
      if (fields["Father's Name"])  result.fatherName = fields["Father's Name"];
      break;

    case 'passport':
      if (fields['Name']) result.fullName = fields['Name'];
      break;

    case '10th':
      if (fields['Percentage']) {
        const v = parseFloat(fields['Percentage']);
        if (!isNaN(v)) result.pct10Score = String(v);
      }
      if (fields['Year of Passing']) result.pct10Year = fields['Year of Passing'];
      break;

    case '12th':
      if (fields['Percentage']) {
        const v = parseFloat(fields['Percentage']);
        if (!isNaN(v)) result.pct12Score = String(v);
      }
      if (fields['Year of Passing']) result.pct12Year = fields['Year of Passing'];
      break;

    case 'degree':
    case 'diploma':
    case 'pc': {
      const scoreType = fields['Score Type'];
      if (scoreType === 'CGPA' && fields['CGPA']) {
        const raw = fields['CGPA'].split('/')[0].trim();
        result.pctGradScore = raw;
        result.pctGradType  = 'cgpa';
      } else if (fields['Percentage']) {
        const v = parseFloat(fields['Percentage']);
        if (!isNaN(v)) { result.pctGradScore = String(v); result.pctGradType = 'percentage'; }
      }
      if (fields['Year of Passing']) { result.pctGradYear = fields['Year of Passing']; result.qualYear = fields['Year of Passing']; }
      if (fields['Degree']) result.qualName = fields['Degree'].replace(/\s+in\s+.*$/i, '').trim().slice(0, 40);
      break;
    }

    case 'gre':
      if (fields['Score'] !== undefined) result.greScore = String(fields['Score']);
      break;

    case 'ielts':
      if (fields['Overall Band Score'] !== undefined) result.ieltsScore = String(fields['Overall Band Score']);
      else if (fields['Score'] !== undefined)         result.ieltsScore = String(fields['Score']);
      break;

    case 'toefl':
      if (fields['Score'] !== undefined) result.toeflScore = String(fields['Score']);
      break;

    case 'duolingo':
      if (fields['Score'] !== undefined) result.duolingoScore = String(fields['Score']);
      break;

    case 'i20':
      if (fields['University']) result.targetUniversity     = fields['University'];
      if (fields['Program'])    result.courseNameUniversity = fields['Program'];
      result.i20Received = 'Yes';
      break;

    case 'visa_letter':
      result.visaBooked = 'Yes';
      if (fields['Appointment Date']) result.visaSlotDate = fields['Appointment Date'];
      else if (fields['Date'])        result.visaSlotDate = fields['Date'];
      break;

    case 'cibil':
      if (fields['Score'] !== undefined) result.studentCibil = String(fields['Score']);
      break;

    default:
      break;
  }

  return result;
}

export function extractCoApplicantAutoFill(type, fields) {
  const result = {};
  if (type === 'aadhaar' || type === 'pan') {
    if (fields['Name']) result.name = fields['Name'];
  }
  if (type === 'aadhaar' && fields['Address']) {
    result.currentAddress   = fields['Address'];
    result.permanentAddress = fields['Address'];
  }
  return result;
}
