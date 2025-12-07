// lib/financialMath.js

// Función auxiliar para redondear a 2 decimales (como BigDecimal)
const round = (num) => Math.round((num + Number.EPSILON) * 100) / 100;

export const FinancialService = {
  /**
   * Calcula la Tasa Efectiva Mensual (TEM) desde la TEA.
   * Fórmula: TEM = (1 + TEA)^(1/12) - 1
   */
  calculateTem: (teaAnnual) => {
    // Si la tasa viene como 20.0, la convertimos a 0.20
    const tea = teaAnnual > 1 ? teaAnnual / 100 : teaAnnual;
    const tem = Math.pow(1 + tea, 1 / 12) - 1;
    return tem;
  },

  /**
   * Calcula la Cuota Fija (Método Francés).
   * Fórmula: P * (TEM * (1+TEM)^n) / ((1+TEM)^n - 1)
   */
  calculateInstallmentAmount: (principal, tem, months) => {
    if (tem === 0) return round(principal / months);

    const numerator = tem * Math.pow(1 + tem, months);
    const denominator = Math.pow(1 + tem, months) - 1;
    return round(principal * (numerator / denominator));
  },

  /**
   * Genera el Cronograma de Pagos (Lista de Cuotas).
   */
  generateSchedule: (principal, tem, months, startDateStr) => {
    const installmentAmount = FinancialService.calculateInstallmentAmount(
      principal,
      tem,
      months
    );
    let currentBalance = principal;
    const schedule = [];

    // Parseamos la fecha de inicio (o usamos hoy si es null)
    // Nota: en producción real usaremos date-fns para sumar meses con precisión
    let currentDate = startDateStr ? new Date(startDateStr) : new Date();

    for (let i = 1; i <= months; i++) {
      // Cálculo de intereses de la cuota: Saldo * TEM
      const interest = round(currentBalance * tem);

      // Amortización (Capital): Cuota - Interés
      let capital = round(installmentAmount - interest);

      // Ajuste para la última cuota (para que el saldo quede en 0)
      if (i === months) {
        capital = currentBalance;
        // En la última cuota, el monto puede variar centavos para cuadrar
      }

      currentBalance = round(currentBalance - capital);

      // Avanzar un mes
      currentDate.setMonth(currentDate.getMonth() + 1);

      schedule.push({
        num: i,
        dueDate: currentDate.toISOString().split("T")[0], // YYYY-MM-DD
        amount: installmentAmount,
        interest: interest,
        capital: capital,
        balance: currentBalance < 0 ? 0 : currentBalance,
      });
    }

    return schedule;
  },
};
