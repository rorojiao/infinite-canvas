"use client";

import { useCallback, useEffect, useState } from "react";
import { App, Button, Card, Input, Segmented, Space, Spin, Tag, Typography, Modal } from "antd";
import { GiftOutlined, ShoppingCartOutlined, WalletOutlined } from "@ant-design/icons";
import { QRCodeCanvas as QRCode } from "qrcode.react";
import { StripePaymentElement } from "./components/stripe-payment-element";
import {
    fetchPlans, createOrder, cancelOrder, redeemCode,
    type BillingPlans, type OrderResult, type QuotaPackage, type SubscriptionPlan,
} from "@/services/api/billing";

type PaymentMethodInfo = { dailyLimit: number; used: number; remaining: number | null; available: boolean; singleMax: number; feeRate: number };
type LimitsResponse = { methods: Record<string, PaymentMethodInfo> };
import { useUserStore } from "@/stores/use-user-store";
import { formatQuota, remainingQuota } from "@/lib/quota";

const { Title, Text, Paragraph } = Typography;

const STATUS_LABELS: Record<string, { text: string; color: string }> = {
    PENDING: { text: "待支付", color: "orange" },
    PAID: { text: "已支付", color: "blue" },
    RECHARGING: { text: "充值中", color: "processing" },
    COMPLETED: { text: "已完成", color: "success" },
    EXPIRED: { text: "已过期", color: "default" },
    CANCELLED: { text: "已取消", color: "default" },
    FAILED: { text: "失败", color: "error" },
    REFUNDED: { text: "已退款", color: "purple" },
    REFUNDING: { text: "退款中", color: "processing" },
    REFUND_FAILED: { text: "退款失败", color: "error" },
};

export default function BillingPage() {
    const { message } = App.useApp();
    const user = useUserStore((s) => s.user);
    const fetchUser = useUserStore((s) => s.fetchUser);
    const [plans, setPlans] = useState<BillingPlans | null>(null);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<"quota" | "subscription" | "redeem">("quota");
    const [selectedPackage, setSelectedPackage] = useState<QuotaPackage | null>(null);
    const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
    const [paymentType, setPaymentType] = useState("");
    const [availableMethods, setAvailableMethods] = useState<Record<string, PaymentMethodInfo>>({});
    const [submitting, setSubmitting] = useState(false);
    const [activeOrder, setActiveOrder] = useState<OrderResult | null>(null);
    const [payModalOpen, setPayModalOpen] = useState(false);
    const [redeemInput, setRedeemInput] = useState("");
    const [redeeming, setRedeeming] = useState(false);

    const loadPlans = useCallback(async () => {
        try {
            setPlans(await fetchPlans());
        } catch (e) {
            message.error(e instanceof Error ? e.message : "加载失败");
        } finally {
            setLoading(false);
        }
    }, [message]);

    useEffect(() => { void loadPlans(); }, [loadPlans]);

    useEffect(() => {
        fetch("/api/billing/limits")
            .then((r) => r.json())
            .then((d: LimitsResponse) => {
                const methods = d.methods || {};
                setAvailableMethods(methods);
                const available = Object.entries(methods).filter(([, v]) => v.available);
                if (available.length > 0 && !paymentType) {
                    setPaymentType(available[0][0]);
                }
            })
            .catch(() => {});
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleCreateOrder = async (orderType: "quota" | "subscription") => {
        if (orderType === "quota" && !selectedPackage) { message.warning("请选择套餐"); return; }
        if (orderType === "subscription" && !selectedPlan) { message.warning("请选择订阅计划"); return; }
        setSubmitting(true);
        try {
            const result = await createOrder({
                paymentType,
                orderType,
                packageId: orderType === "quota" ? selectedPackage!.id : undefined,
                planId: orderType === "subscription" ? selectedPlan!.id : undefined,
            });
            setActiveOrder(result);
            setPayModalOpen(true);
            message.success("订单已创建，请完成支付");
        } catch (e) {
            message.error(e instanceof Error ? e.message : "创建订单失败");
        } finally {
            setSubmitting(false);
        }
    };

    const handleRedeem = async () => {
        if (!redeemInput.trim()) { message.warning("请输入兑换码"); return; }
        setRedeeming(true);
        try {
            const result = await redeemCode(redeemInput.trim());
            message.success(result.type === "subscription" ? `兑换成功，获得 ${result.value} 天订阅` : `兑换成功，获得 ${result.value} 点额度`);
            setRedeemInput("");
            await fetchUser();
        } catch (e) {
            message.error(e instanceof Error ? e.message : "兑换失败");
        } finally {
            setRedeeming(false);
        }
    };

    const handleCancelOrder = async () => {
        if (!activeOrder) return;
        try {
            await cancelOrder(activeOrder.orderId);
            message.success("订单已取消");
            setPayModalOpen(false);
            setActiveOrder(null);
        } catch (e) {
            message.error(e instanceof Error ? e.message : "取消失败");
        }
    };

    const handlePayComplete = async () => {
        setPayModalOpen(false);
        setActiveOrder(null);
        await fetchUser();
        message.success("支付完成，额度已更新");
    };

    const remaining = user ? remainingQuota(user.quota ?? 0, user.usedQuota ?? 0) : 0;

    return (
        <div className="h-full overflow-auto bg-background px-6 py-6">
            <div className="mx-auto max-w-4xl">
                <div className="mb-6 flex items-center justify-between">
                    <Title level={3} className="!mb-0">
                        <WalletOutlined className="mr-2" />
                        充值中心
                    </Title>
                    <Space>
                        <Tag color={remaining <= 0 && remaining !== -1 ? "red" : "blue"} className="!px-3 !py-1 !text-sm">
                            {remaining === -1 ? "无限额度" : `剩余 ${formatQuota(remaining)}`}
                        </Tag>
                    </Space>
                </div>

                <Segmented
                    value={tab}
                    onChange={(v) => setTab(v as typeof tab)}
                    options={[
                        { label: "充值套餐", value: "quota", icon: <ShoppingCartOutlined /> },
                        { label: "订阅会员", value: "subscription", icon: <GiftOutlined /> },
                        { label: "兑换码", value: "redeem", icon: <GiftOutlined /> },
                    ]}
                    className="mb-6"
                />

                {loading ? (
                    <div className="flex justify-center py-20"><Spin /></div>
                ) : tab === "quota" ? (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {(plans?.quotaPackages || []).map((pkg) => (
                            <Card
                                key={pkg.id}
                                hoverable
                                className={`cursor-pointer transition ${selectedPackage?.id === pkg.id ? "ring-2 ring-blue-500" : ""}`}
                                onClick={() => setSelectedPackage(pkg)}
                            >
                                <div className="text-center">
                                    <Title level={4} className="!mb-1">{pkg.name}</Title>
                                    {pkg.originalPrice && (
                                        <Text delete className="!text-sm !text-gray-400">¥{pkg.originalPrice}</Text>
                                    )}
                                    <div className="my-2">
                                        <Text strong className="!text-2xl !text-blue-600">¥{pkg.price}</Text>
                                    </div>
                                    <Paragraph className="!mb-0">
                                        <Text strong className="!text-lg">{pkg.quota}</Text> 次额度
                                        {pkg.bonusQuota > 0 && (
                                            <Text type="success" className="!ml-1">+{pkg.bonusQuota} 赠送</Text>
                                        )}
                                    </Paragraph>
                                </div>
                            </Card>
                        ))}
                    </div>
                ) : tab === "subscription" ? (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        {(plans?.subscriptionPlans || []).map((plan) => (
                            <Card
                                key={plan.id}
                                hoverable
                                className={`cursor-pointer transition ${selectedPlan?.id === plan.id ? "ring-2 ring-blue-500" : ""}`}
                                onClick={() => setSelectedPlan(plan)}
                            >
                                <div className="text-center">
                                    <Title level={4} className="!mb-1">{plan.name}</Title>
                                    {plan.originalPrice && (
                                        <Text delete className="!text-sm !text-gray-400">¥{plan.originalPrice}</Text>
                                    )}
                                    <div className="my-2">
                                        <Text strong className="!text-2xl !text-blue-600">¥{plan.price}</Text>
                                    </div>
                                    <Paragraph className="!mb-2">
                                        每 {plan.validityDays} 天 {plan.quotaPerPeriod} 次额度
                                    </Paragraph>
                                    {plan.features.map((f, i) => (
                                        <Tag key={i} className="!mb-1">{f}</Tag>
                                    ))}
                                </div>
                            </Card>
                        ))}
                    </div>
                ) : (
                    <Card>
                        <Space direction="vertical" className="w-full">
                            <Text>输入兑换码获取额外额度或订阅</Text>
                            <Input
                                value={redeemInput}
                                onChange={(e) => setRedeemInput(e.target.value)}
                                placeholder="请输入兑换码"
                                size="large"
                                className="!max-w-md"
                            />
                            <Button type="primary" loading={redeeming} onClick={handleRedeem} className="!max-w-[120px]">
                                兑换
                            </Button>
                        </Space>
                    </Card>
                )}

                {tab !== "redeem" && (
                    <Card className="mt-6">
                        <Space className="w-full justify-between">
                            <Space>
                                <Text>支付方式：</Text>
                                {Object.keys(availableMethods).length > 0 ? (
                                    <Segmented
                                        value={paymentType}
                                        onChange={(v) => setPaymentType(v as string)}
                                        options={Object.entries(availableMethods).map(([key, info]) => ({
                                            label: key === "alipay" ? "支付宝" : key === "wxpay" ? "微信" : key === "stripe" ? "Stripe" : key,
                                            value: key,
                                            disabled: !info.available,
                                        }))}
                                    />
                                ) : (
                                    <Text type="secondary">暂无可用支付方式，请联系管理员配置</Text>
                                )}
                            </Space>
                            <Button
                                type="primary"
                                size="large"
                                loading={submitting}
                                disabled={(tab === "quota" ? !selectedPackage : !selectedPlan) || !paymentType}
                                onClick={() => handleCreateOrder(tab)}
                            >
                                {tab === "quota" ? `充值 ${selectedPackage ? `¥${selectedPackage.price}` : ""}` : `订阅 ${selectedPlan ? `¥${selectedPlan.price}` : ""}`}
                            </Button>
                        </Space>
                    </Card>
                )}

                <div className="mt-4 text-right">
                    <Button type="link" href="/billing/orders">我的订单 →</Button>
                </div>
            </div>

            {/* 支付弹窗 */}
            <Modal
                title="完成支付"
                open={payModalOpen}
                onCancel={() => setPayModalOpen(false)}
                footer={[
                    <Button key="cancel" danger onClick={handleCancelOrder}>取消订单</Button>,
                    <Button key="done" type="primary" onClick={handlePayComplete}>支付完成</Button>,
                ]}
                width={420}
            >
                {activeOrder && (
                    <div className="text-center">
                        <Paragraph>需支付 <Text strong className="!text-xl !text-blue-600">¥{activeOrder.payAmount}</Text></Paragraph>
                        {activeOrder.qrCode ? (
                            <div className="flex flex-col items-center gap-2">
                                <QRCode value={activeOrder.qrCode} size={200} />
                                <Text type="secondary">请使用{paymentType === "alipay" ? "支付宝" : "微信"}扫码支付</Text>
                            </div>
                        ) : activeOrder.payUrl ? (
                            <div>
                                <a href={activeOrder.payUrl} target="_blank" rel="noopener noreferrer">
                                    <Button type="primary" size="large">前往支付页面</Button>
                                </a>
                            </div>
                        ) : activeOrder.clientSecret ? (
                            <StripePaymentElement
                                clientSecret={activeOrder.clientSecret}
                                publishableKey={activeOrder.publishableKey}
                                onPaid={handlePayComplete}
                            />
                        ) : (
                            <Text type="secondary">请在支付页面完成支付</Text>
                        )}
                    </div>
                )}
            </Modal>
        </div>
    );
}
