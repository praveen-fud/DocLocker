import hdfcLogo from "../assets/Banks/hdfc.jpg";
import credilaLogo from "../assets/Banks/credila.png";
import avenseLogo from "../assets/Banks/avense.jpg";
import auxiloLogo from "../assets/Banks/Auxilo.jpg";
import incredLogo from "../assets/Banks/InCred.png";
import tataLogo from "../assets/Banks/Tata.png";
import poonawallaLogo from "../assets/Banks/Poonawalla.jpg";
import idfcLogo from "../assets/Banks/idfc.avif";
import iciciLogo from "../assets/Banks/icici.png";
import axisLogo from "../assets/Banks/axis.png";
import yesLogo from "../assets/Banks/yes.png";
import otherLogo from "../assets/Banks/other.png";

export const BANK_OPTIONS = [
  { value: "HDFC Bank",                       label: "HDFC Bank",                       logo: hdfcLogo },
  { value: "HDFC Credila Financial Services", label: "HDFC Credila Financial Services", logo: credilaLogo },
  { value: "Avanse Financial Services",       label: "Avanse Financial Services",       logo: avenseLogo },
  { value: "Auxilo Finserve",                 label: "Auxilo Finserve",                 logo: auxiloLogo },
  { value: "InCred Finance",                  label: "InCred Finance",                  logo: incredLogo },
  { value: "Tata Capital",                    label: "Tata Capital",                    logo: tataLogo },
  { value: "Poonawalla Fincorp",              label: "Poonawalla Fincorp",              logo: poonawallaLogo },
  { value: "IDFC FIRST Bank",                 label: "IDFC FIRST Bank",                 logo: idfcLogo },
  { value: "ICICI Bank",                      label: "ICICI Bank",                      logo: iciciLogo },
  { value: "Axis Bank",                       label: "Axis Bank",                       logo: axisLogo },
  { value: "YES Bank",                        label: "YES Bank",                        logo: yesLogo },
  { value: "Others",                          label: "Others",                          logo: otherLogo },
];

export function getBankLogo(bankName) {
  return BANK_OPTIONS.find((o) => o.value === bankName)?.logo ?? otherLogo;
}
