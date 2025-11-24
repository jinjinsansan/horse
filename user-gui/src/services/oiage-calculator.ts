export interface OiageSettings {
  baseAmount: number;
  targetProfit: number;
  maxSteps: number;
}

export interface OiageStateSnapshot {
  currentStep: number;
  totalInvestment: number;
}

export function createOiageCalculator(settings: OiageSettings) {
  return {
    nextBetAmount(snapshot: OiageStateSnapshot) {
      if (snapshot.currentStep === 0) {
        return settings.baseAmount;
      }
      const required = snapshot.totalInvestment + settings.targetProfit;
      const minOdds = 1.5;
      const raw = Math.ceil(required / minOdds / 100) * 100;
      return Math.max(raw, settings.baseAmount);
    },
    shouldStop(snapshot: OiageStateSnapshot) {
      return snapshot.currentStep >= settings.maxSteps;
    },
  };
}
