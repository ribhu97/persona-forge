import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Check, Sparkles, Zap, Crown, X, Loader2 } from 'lucide-react';
import { paymentAPI } from '@/lib/api';


// removed toast and sonner import to fix lint error and safe fallback to alert for now


declare global {
    interface Window {
        Razorpay: any;
    }
}

type Currency = 'USD' | 'INR';

interface PricingTier {
    name: string;
    icon: React.ReactNode;
    description: string;
    price: { USD: string; INR: string };
    period: string;
    features: string[];
    limitations?: string[];
    highlighted?: boolean;
    badge?: string;
    buttonText: string;
    buttonVariant: 'default' | 'outline' | 'secondary';
}

const PRICING_TIERS: PricingTier[] = [
    {
        name: 'Free',
        icon: <Zap className="h-6 w-6" />,
        description: 'Get started with basic persona generation',
        price: { USD: '$0', INR: '₹0' },
        period: '/month',
        features: [
            '1 export per week',
            '3 chat threads per month',
            '3 messages per thread',
        ],
        limitations: [
            'Limited exports',
            'Basic features only',
        ],
        buttonText: 'Get Started',
        buttonVariant: 'outline',
    },
    {
        name: 'Plus',
        icon: <Sparkles className="h-6 w-6" />,
        description: 'Perfect for regular users and small teams',
        price: { USD: '$5', INR: '₹500' },
        period: '/month',
        features: [
            '5 exports per week',
            '20 chat threads per month',
            '10 messages per thread',
            'Priority support',
        ],
        highlighted: true,
        badge: 'Most Popular',
        buttonText: 'Upgrade to Plus',
        buttonVariant: 'default',
    },
    {
        name: 'Pro',
        icon: <Crown className="h-6 w-6" />,
        description: 'For power users who need unlimited access',
        price: { USD: '$10', INR: '₹1000' },
        period: '/month',
        features: [
            'Unlimited exports',
            'Unlimited chat threads',
            'Unlimited messages',
            'Access to experimental features',
            'Priority support',
        ],
        buttonText: 'Go Pro',
        buttonVariant: 'secondary',
    },
];

const LIFETIME_OFFER = {
    price: { USD: '$200', INR: '₹20,000' },
    originalMonthlyPrice: { USD: '$5', INR: '₹500' },
    savings: { USD: 'Save $40+', INR: 'Save ₹4,000+' },
};

interface PricingPageProps {
    onClose?: () => void;
    className?: string;
    isAuthenticated?: boolean;
    onLogin?: () => void;
}

export function PricingPage({ onClose, className, isAuthenticated, onLogin }: PricingPageProps) {
    const [currency, setCurrency] = useState<Currency>('USD');
    const [isLoading, setIsLoading] = useState<string | null>(null);

    const handleSubscribe = async (tierName: string, amount: string) => {
        if (!isAuthenticated) {
            onLogin?.();
            return;
        }

        if (tierName === 'Free') {
            onClose?.();
            return;
        }

        try {
            setIsLoading(tierName);
            // Parse amount (remove currency symbol)
            const numAmount = parseFloat(amount.replace(/[^0-9.]/g, ''));
            const planType = tierName === 'Lifetime Plus Membership' ? 'lifetime' : tierName.toLowerCase();

            // 1. Create Order
            const order = await paymentAPI.createOrder(planType, numAmount, currency);

            // 2. Initialize Razorpay
            const options = {
                key: import.meta.env.VITE_RAZORPAY_KEY_ID || order.key_id,
                amount: order.amount,
                currency: order.currency,
                name: "Persona Forge",
                description: `${tierName} Plan`,
                order_id: order.order_id,
                handler: async function (response: any) {
                    try {
                        // 3. Verify Payment
                        await paymentAPI.verifyPayment({
                            razorpay_order_id: response.razorpay_order_id,
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_signature: response.razorpay_signature,
                            plan_type: planType
                        });

                        alert('Payment successful! Your account has been upgraded.');
                        // Ideally refresh user profile here or reload
                        window.location.reload();
                    } catch (error) {
                        console.error("Verification failed", error);
                        alert('Payment verification failed. Please contact support.');
                    }
                },
                prefill: {
                    // We could fill user details here if available
                },
                theme: {
                    color: "#000000"
                }
            };

            const rzp = new window.Razorpay(options);
            rzp.open();

        } catch (error) {
            console.error("Subscription failed", error);
            alert('Failed to initiate subscription. Please try again.');
        } finally {
            setIsLoading(null);
        }
    };

    return (
        <div className={cn(
            "min-h-screen bg-background py-12 px-4 sm:px-6 lg:px-8 relative",
            className
        )}>
            {/* Close Button */}
            {onClose && (
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onClose}
                    className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-all duration-200 z-50 rounded-full hover:bg-muted"
                    aria-label="Close pricing page"
                >
                    <X className="h-6 w-6" />
                </Button>
            )}

            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="text-center space-y-4 mb-12">
                    <h1 className="text-4xl sm:text-5xl font-bold tracking-tight bg-gradient-to-r from-[hsl(var(--title-gradient-from))] to-[hsl(var(--title-gradient-to))] bg-clip-text text-transparent pb-2 font-display">
                        Simple, Transparent Pricing
                    </h1>
                    <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto font-medium leading-relaxed">
                        Choose the plan that fits your needs. Upgrade or downgrade anytime.
                    </p>

                    {/* Currency Toggle */}
                    <div className="flex items-center justify-center gap-3 pt-4">
                        <span className={cn(
                            "text-sm font-medium transition-colors",
                            currency === 'USD' ? 'text-foreground' : 'text-muted-foreground'
                        )}>
                            USD ($)
                        </span>
                        <button
                            onClick={() => setCurrency(currency === 'USD' ? 'INR' : 'USD')}
                            className={cn(
                                "relative inline-flex h-8 w-16 items-center rounded-full transition-all duration-300 ease-in-out cursor-pointer",
                                currency === 'USD' ? "bg-blue-500/10 border-blue-500/30" : "bg-emerald-500/10 border-emerald-500/30",
                                "border-2 shadow-inner focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                            )}
                            aria-label="Toggle currency"
                        >
                            <span
                                className={cn(
                                    "inline-block h-6 w-6 transform rounded-full shadow-lg transition-all duration-300 ease-in-out",
                                    currency === 'USD' ? "bg-blue-600 translate-x-1" : "bg-emerald-600 translate-x-8"
                                )}
                            />
                        </button>
                        <span className={cn(
                            "text-sm font-medium transition-colors",
                            currency === 'INR' ? 'text-foreground' : 'text-muted-foreground'
                        )}>
                            INR (₹)
                        </span>
                    </div>
                </div>

                {/* Pricing Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                    {PRICING_TIERS.map((tier) => (
                        <Card
                            key={tier.name}
                            className={cn(
                                "relative flex flex-col transition-all duration-300 ease-out hover:shadow-strong",
                                tier.highlighted
                                    ? "border-2 border-primary shadow-strong scale-[1.05] ring-4 ring-primary/5 z-10"
                                    : "border border-border shadow-soft hover:border-primary/50"
                            )}
                        >
                            {tier.badge && (
                                <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-[30]">
                                    <span className="inline-flex items-center px-4 py-1.5 rounded-full text-xs font-bold bg-black text-white shadow-[0_4px_12px_rgba(0,0,0,0.3)] whitespace-nowrap border border-white/10">
                                        {tier.badge}
                                    </span>
                                </div>
                            )}

                            <CardHeader className="text-center pb-2">
                                <div className={cn(
                                    "mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full",
                                    tier.highlighted
                                        ? "bg-primary text-primary-foreground"
                                        : "bg-muted text-foreground"
                                )}>
                                    {tier.icon}
                                </div>
                                <CardTitle className="text-2xl font-bold">{tier.name}</CardTitle>
                                <CardDescription className="text-sm">{tier.description}</CardDescription>
                            </CardHeader>

                            <CardContent className="flex-1 space-y-6">
                                {/* Price */}
                                <div className="text-center">
                                    <span className="text-4xl font-extrabold tracking-tight">
                                        {tier.price[currency]}
                                    </span>
                                    <span className="text-muted-foreground font-medium">{tier.period}</span>
                                </div>

                                {/* Features */}
                                <ul className="space-y-3">
                                    {tier.features.map((feature, index) => (
                                        <li key={index} className="flex items-start gap-3">
                                            <Check className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                                            <span className="text-sm text-foreground">{feature}</span>
                                        </li>
                                    ))}
                                    {tier.limitations?.map((limitation, index) => (
                                        <li key={`limit-${index}`} className="flex items-start gap-3">
                                            <X className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                                            <span className="text-sm text-muted-foreground">{limitation}</span>
                                        </li>
                                    ))}
                                </ul>
                            </CardContent>

                            <CardFooter className="pt-4">
                                <Button
                                    variant={tier.buttonVariant}
                                    disabled={isLoading !== null}
                                    onClick={() => handleSubscribe(tier.name, tier.price[currency])}
                                >
                                    {isLoading === tier.name ? (
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    ) : null}
                                    {tier.buttonText}
                                </Button>
                            </CardFooter>
                        </Card>
                    ))}
                </div>

                {/* Lifetime Offer Banner */}
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 border border-primary/20 p-6 sm:p-8">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,hsl(var(--primary)/0.1),transparent_50%)]" />
                    <div className="relative flex flex-col sm:flex-row items-center justify-between gap-6">
                        <div className="flex items-center gap-4">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
                                <Sparkles className="h-6 w-6" />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-foreground">
                                    Lifetime Plus Membership
                                </h3>
                                <p className="text-sm text-muted-foreground">
                                    One-time payment, forever access to Plus features
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-6">
                            <div className="text-center sm:text-right">
                                <div className="text-3xl font-extrabold text-foreground">
                                    {LIFETIME_OFFER.price[currency]}
                                </div>
                                <div className="text-sm text-green-600 dark:text-green-400 font-medium">
                                    {LIFETIME_OFFER.savings[currency]} vs monthly
                                </div>
                            </div>
                            <Button
                                size="lg"
                                className="font-semibold shadow-medium hover:shadow-strong whitespace-nowrap"
                                onClick={() => handleSubscribe('Lifetime Plus Membership', LIFETIME_OFFER.price[currency])}
                                disabled={isLoading !== null}
                            >
                                {isLoading === 'Lifetime Plus Membership' ? (
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                ) : null}
                                Get Lifetime Access
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer Note */}
            <p className="text-center text-sm text-muted-foreground mt-8">
                All plans include basic support. Prices are in {currency === 'USD' ? 'US Dollars' : 'Indian Rupees'}.
                {onClose && (
                    <button
                        onClick={onClose}
                        className="ml-2 text-primary hover:underline font-medium"
                    >
                        Go back
                    </button>
                )}
            </p>
        </div>
    );
}
