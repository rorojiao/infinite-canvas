import type { PaymentProvider, PaymentType } from "./types";

export class PaymentProviderRegistry {
    private providers = new Map<PaymentType, PaymentProvider>();

    register(provider: PaymentProvider): void {
        for (const type of provider.supportedTypes) {
            this.providers.set(type, provider);
        }
    }

    getProvider(paymentType: PaymentType): PaymentProvider | undefined {
        return this.providers.get(paymentType);
    }

    getProviderKey(paymentType: PaymentType): string | undefined {
        return this.providers.get(paymentType)?.providerKey;
    }

    getDefaultLimit(paymentType: PaymentType): { singleMax?: number; dailyMax?: number } | undefined {
        for (const provider of this.providers.values()) {
            const limit = provider.defaultLimits?.[paymentType];
            if (limit) return limit;
        }
        return undefined;
    }

    getAllProviders(): PaymentProvider[] {
        return [...new Set(this.providers.values())];
    }

    hasProvider(paymentType: PaymentType): boolean {
        return this.providers.has(paymentType);
    }
}

export const paymentRegistry = new PaymentProviderRegistry();
