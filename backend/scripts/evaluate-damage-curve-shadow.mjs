import { evaluateDamageCurveShadow } from '../dist/scripts/evaluateDamageCurveShadow.js'

const result = await evaluateDamageCurveShadow()
console.log(JSON.stringify(result, null, 2))
