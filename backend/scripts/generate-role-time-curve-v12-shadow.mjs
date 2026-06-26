import { generateRoleTimeCurveV12Shadow } from '../dist/scripts/generateRoleTimeCurveV12Shadow.js'

const result = await generateRoleTimeCurveV12Shadow()
console.log(JSON.stringify(result, null, 2))

