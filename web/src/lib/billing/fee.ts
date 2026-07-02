/** 获取指定支付渠道的手续费率（百分比） */
export function getMethodFeeRate(paymentType: string): number {
    const raw = process.env[`FEE_RATE_${paymentType.toUpperCase()}`];
    if (raw !== undefined && raw !== "") {
        const num = Number(raw);
        if (Number.isFinite(num) && num >= 0) return num;
    }
    return 0;
}

/** 根据到账金额和手续费率计算实付金额 */
export function calculatePayAmount(rechargeAmount: number, feeRate: number): number {
    if (feeRate <= 0) return Math.round(rechargeAmount * 100) / 100;
    const feeAmount = Math.ceil((rechargeAmount * feeRate) / 100 * 100) / 100;
    return Math.round((rechargeAmount + feeAmount) * 100) / 100;
}
