// Unicode CLDR regular region identifiers; reviewed 2026-09-05.
// Source: unicode-org/cldr/common/validity/region.xml (Unicode-3.0).
// Includes 249 ISO territories plus 8 CLDR regions; not a sovereignty judgment.
const ranges = `AC~G AI AL~M AO AQ~U AW~X AZ
BA~B BD~J BL~O BQ~T BV~W BY~Z
CA CC~D CF~I CK~R CU~Z DE DG DJ~K DM DO DZ EA EC EE EG~H ER~T
FI~K FM FO FR GA~B GD~I GL~N GP~U GW GY HK HM~N HR HT~U
IC~E IL~O IQ~T JE JM JO~P KE KG~I KM~N KP KR KW KY~Z
LA~C LI LK LR~V LY MA MC~H MK~Z NA NC NE~G NI NL NO~P NR NU NZ OM
PA PE~H PK~N PR~T PW PY QA RE RO RS RU RW SA~E SG~O SR~T SV SX~Z
TA TC~D TF~H TJ~O TR TT TV~W TZ UA UG UM US UY~Z VA VC VE VG VI VN VU
WF WS XK YE YT ZA ZM ZW`;
export const countryCodes = ranges.split(/\s+/).flatMap((value) => {
  const [start, end] = value.split('~');
  return end
    ? Array.from(
        { length: end.charCodeAt(0) - start.charCodeAt(1) + 1 },
        (_, i) => start[0] + String.fromCharCode(start.charCodeAt(1) + i),
      )
    : [start];
});
const names = new Intl.DisplayNames(['en'], { type: 'region' });
export const countries = countryCodes
  .map((code) => ({ code, name: names.of(code) ?? code }))
  .sort((a, b) => a.name.localeCompare(b.name, 'en'));
export const countryName = (code: string) =>
  code === 'ZZ'
    ? 'Unknown location'
    : (countries.find((c) => c.code === code)?.name ?? code);
