import { generateRoleTimeCurveCandidate } from '../dist/scripts/generateRoleTimeCurveCandidate.js'

const result = await generateRoleTimeCurveCandidate()
console.log(JSON.stringify(result, null, 2))

