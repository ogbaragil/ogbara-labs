
/* Phase 3 Fractions Toolkit */
const BTFractions = {
 lessons: {
  compare: {
   miniLesson:"Fractions must be compared by the size of equal parts, not just the numbers.",
   workedExample:["1/2 vs 1/4","Split same whole","Compare piece size","1/2 is larger"]
  }
 },
 misconceptions: {
  largerDenominatorLargerFraction:{
   detect:(a,b)=>true,
   feedback:"When a whole is split into more equal parts, each part becomes smaller."
  },
  numeratorOnly:{
   feedback:"Compare both numerator and denominator."
  }
 },
 remediationFor(type){
   const map={
    largerDenominatorLargerFraction:"fraction-bars",
    numeratorOnly:"number-line"
   };
   return map[type]||"guided-fractions";
 }
};
