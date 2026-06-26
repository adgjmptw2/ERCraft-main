import { generateRoleTimeCurveCandidateV11 } from '../dist/scripts/generateRoleTimeCurveCandidateV11.js'

const result = await generateRoleTimeCurveCandidateV11()
console.log(JSON.stringify(result, null, 2))

