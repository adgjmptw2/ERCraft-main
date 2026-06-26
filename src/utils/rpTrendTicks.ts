const CANDIDATE_STEPS = [25, 50, 100, 200, 500, 1000] as const

function buildTicks(domainMin: number, domainMax: number, step: number): number[] {
  const tickMin = Math.floor(domainMin / step) * step
  const tickMax = Math.ceil(domainMax / step) * step
  const ticks: number[] = []
  for (let value = tickMin; value <= tickMax; value += step) {
    ticks.push(value)
  }
  return ticks
}

/** RP 그래프 Y축 — 4~6개 정수 tick, 좁은 범위에서도 읽기 쉽게 */
export function computeYAxisTicks(minValue: number, maxValue: number): {
  ticks: number[]
  domainMin: number
  domainMax: number
} {
  const range = maxValue - minValue || 100

  // 고티어 최근 추이 — 100/200 단위로 촘촘하게 (참고 UI)
  if (maxValue >= 4000 && range <= 1200) {
    const step = range <= 500 ? 100 : 200
    const padding = Math.max(step, Math.ceil(range * 0.12 / step) * step)
    const rawMin = minValue - padding
    const rawMax = maxValue + padding
    let ticks = buildTicks(rawMin, rawMax, step)
    while (ticks.length > 6) {
      ticks = buildTicks(rawMin, rawMax, step * 2)
    }
    if (ticks.length >= 2) {
      return { ticks, domainMin: ticks[0]!, domainMax: ticks[ticks.length - 1]! }
    }
  }

  const padding = Math.max(range * 0.08, 20)
  const rawMin = minValue - padding
  const rawMax = maxValue + padding

  let step: number = CANDIDATE_STEPS[2]
  for (const candidate of CANDIDATE_STEPS) {
    const count = buildTicks(rawMin, rawMax, candidate).length
    if (count >= 4 && count <= 5) {
      step = candidate
      break
    }
    if (count < 4) {
      step = candidate
    }
  }

  let ticks = buildTicks(rawMin, rawMax, step)
  while (ticks.length > 5) {
    const nextIndex = CANDIDATE_STEPS.indexOf(step as (typeof CANDIDATE_STEPS)[number]) + 1
    step = CANDIDATE_STEPS[nextIndex] ?? step * 2
    ticks = buildTicks(rawMin, rawMax, step)
  }

  if (ticks.length < 2) {
    ticks = [Math.floor(minValue / 100) * 100, Math.ceil(maxValue / 100) * 100]
  }

  return {
    ticks,
    domainMin: ticks[0]!,
    domainMax: ticks[ticks.length - 1]!,
  }
}
