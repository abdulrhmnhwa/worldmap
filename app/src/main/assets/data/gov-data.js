// نظام الحكم لكل دولة (تقريبي، حسب الوضع الرسمي حوالي 2024–2025). الأنظمة الانتقالية قد تتغير.
window.GOV_TYPES = {
am:['ملكية مطلقة','Absolute monarchy'],cm:['ملكية دستورية','Constitutional monarchy'],fm:['اتحاد ملكيات / إمارات','Federation of monarchies'],
pr:['جمهورية رئاسية','Presidential republic'],sp:['جمهورية شبه رئاسية','Semi-presidential republic'],pa:['جمهورية برلمانية','Parliamentary republic'],
fp:['جمهورية اتحادية رئاسية','Federal presidential republic'],fa:['جمهورية اتحادية برلمانية','Federal parliamentary republic'],
th:['جمهورية/إمارة إسلامية (حكم ديني)','Islamic (theocratic) state'],op:['دولة الحزب الواحد','One-party state'],
mj:['حكم عسكري','Military rule'],tr:['مرحلة انتقالية','Transitional government']};
(function () {
  var s = 'SAU:am ARE:fm QAT:am KWT:cm OMN:am BHR:cm JOR:cm MAR:cm EGY:pr LBN:pa IRQ:fa SYR:tr PSE:sp YEM:pr LBY:tr TUN:pr DZA:sp SDN:tr MRT:sp SOM:fa DJI:sp COM:fp ' +
  'ALB:pa AND:cm AUT:fa BLR:pr BEL:cm BIH:pa BGR:pa HRV:pa CYP:pr CZE:pa DNK:cm EST:pa FIN:pa FRA:sp DEU:fa GRC:pa HUN:pa ISL:pa IRL:pa ITA:pa KOS:pa LVA:pa LIE:cm LTU:sp LUX:cm MLT:pa MDA:pa MCO:cm MNE:pa NLD:cm MKD:pa NOR:cm POL:pa PRT:sp ROU:sp RUS:sp SMR:pa SRB:pa SVK:pa SVN:pa ESP:cm SWE:cm CHE:pa UKR:sp GBR:cm ' +
  'AFG:th ARM:pa AZE:pr BGD:pa BTN:cm BRN:am KHM:cm CHN:op GEO:pa IND:fa IDN:pr IRN:th JPN:cm KAZ:pr KGZ:pr LAO:op MYS:fm MDV:pr MNG:sp MMR:mj NPL:fa PRK:op PAK:fa PHL:pr SGP:pa KOR:pr LKA:sp TWN:sp TJK:pr THA:cm TLS:sp TKM:pr UZB:pr VNM:op TUR:pr ' +
  'AGO:pr BEN:pr BWA:pa BFA:mj BDI:pr CMR:pr CPV:sp CAF:pr TCD:pr COD:sp COG:pr CIV:pr GNQ:pr ERI:op SWZ:am ETH:fa GAB:pr GMB:pr GHA:pr GIN:mj GNB:sp KEN:pr LSO:cm LBR:pr MDG:sp MWI:pr MLI:mj MUS:pa MOZ:pr NAM:pr NER:mj NGA:fp RWA:pr SEN:pr SLE:pr ZAF:pa SSD:tr TZA:pr TGO:pa UGA:pr ZMB:pr ZWE:pr ' +
  'ARG:fp BLZ:cm BOL:pr BRA:fp CAN:cm CHL:pr COL:pr CRI:pr CUB:op DOM:pr ECU:pr SLV:pr GTM:pr GUY:pr HTI:tr HND:pr JAM:cm MEX:fp NIC:pr PAN:pr PRY:pr PER:pr SUR:pa TTO:pa USA:fp URY:pr VEN:fp BHS:cm BRB:pa GRD:cm ATG:cm LCA:cm VCT:cm DMA:pa KNA:cm ' +
  'AUS:cm NZL:cm FJI:pa PNG:cm SLB:cm VUT:pa WSM:pa TON:cm KIR:pr NRU:pr PLW:pr MHL:pr FSM:pr TUV:cm';
  window.GOV = {};
  s.split(' ').forEach(function (x) { var a = x.split(':'); window.GOV[a[0]] = a[1]; });
})();
