"use client";

import { useEffect, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Button, Spin, Typography } from "antd";

const { Text } = Typography;

function CheckoutForm({ onPaid }: { onPaid: () => void }) {
    const stripe = useStripe();
    const elements = useElements();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!stripe || !elements) return;
        setLoading(true);
        setError(null);
        const result = await stripe.confirmPayment({
            elements,
            redirect: "if_required",
        });
        if (result.error) {
            setError(result.error.message || "支付失败");
            setLoading(false);
        } else {
            onPaid();
        }
    };

    return (
        <form onSubmit={handleSubmit}>
            <PaymentElement />
            {error && <Text type="danger" className="mt-2 block">{error}</Text>}
            <Button type="primary" htmlType="submit" loading={loading} disabled={!stripe} className="mt-4 w-full">
                确认支付
            </Button>
        </form>
    );
}

export function StripePaymentElement({ clientSecret, publishableKey, onPaid }: {
    clientSecret: string;
    publishableKey?: string | null;
    onPaid: () => void;
}) {
    const [stripePromise, setStripePromise] = useState<Promise<unknown> | null>(null);

    useEffect(() => {
        // 从 clientSecret 中提取 publishable key 不可行，
        // 需要从环境变量或配置获取。这里使用全局变量或 API 获取。
        const key = publishableKey || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
        if (key) {
            setStripePromise(loadStripe(key));
        }
    }, []);

    if (!stripePromise) {
        return (
            <div className="py-8 text-center">
                <Spin tip="加载支付组件..." />
                <div className="mt-4">
                    <Text type="secondary">如无法加载，请检查 Stripe 配置</Text>
                </div>
            </div>
        );
    }

    return (
        <Elements stripe={stripePromise as Promise<import("@stripe/stripe-js").Stripe>} options={{ clientSecret }}>
            <CheckoutForm onPaid={onPaid} />
        </Elements>
    );
}
