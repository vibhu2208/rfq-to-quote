/** GSTIN first two digits → state / UT name */
export const GST_STATE_CODES: Record<string, string> = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman and Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
};

const NAME_TO_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(GST_STATE_CODES).map(([code, name]) => [normalizeState(name), code])
);

export function normalizeState(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function getStateCode(stateOrCode: string): string | null {
  const raw = stateOrCode.trim();
  if (/^\d{2}$/.test(raw) && GST_STATE_CODES[raw]) return raw;
  return NAME_TO_CODE[normalizeState(raw)] ?? null;
}

export function getStateName(code: string): string | null {
  return GST_STATE_CODES[code.trim()] ?? null;
}

export function requireStateCode(stateOrCode: string, label = "state"): string {
  const code = getStateCode(stateOrCode);
  if (!code) throw new Error(`Invalid or unsupported ${label}: ${stateOrCode}`);
  return code;
}
