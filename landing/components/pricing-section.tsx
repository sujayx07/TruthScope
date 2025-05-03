"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Check, ChevronRight, X } from "lucide-react"
import { cn } from "@/lib/utils"

export function PricingSection() {
  const [isVisible, setIsVisible] = useState(false)
  const [isYearly, setIsYearly] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
        }
      },
      { threshold: 0.1 },
    )

    if (sectionRef.current) {
      observer.observe(sectionRef.current)
    }

    return () => {
      if (sectionRef.current) {
        observer.unobserve(sectionRef.current)
      }
    }
  }, [])

  const plans = [
    {
      name: "Free",
      description: "Basic protection for casual browsing",
      monthlyPrice: "₹0",
      yearlyPrice: "₹0",
      features: [
        { name: "Basic fake news detection", included: true },
        { name: "AI-powered analysis", included: true },
        { name: "Limited article scans (10/week)", included: true },
        { name: "Limited media scans (1/week)", included: true },
        { name: "Source credibility scoring", included: true },
        { name: "Detailed analysis reports", included: false },
        { name: "Priority updates", included: false},
        { name: "API access", included: false},
        { name: "Custom reporting", included: false},

      ],
      cta: "Install Free",
      popular: false,
      color: "from-slate-500 to-slate-600",
    },
    {
      name: "Starter",
      description: "Advanced protection for daily users",
      monthlyPrice: "₹99",
      yearlyPrice: "₹899",
      yearlyDiscount: "Save 25%",
      features: [
        { name: "Basic fake news detection", included: true },
        { name: "AI-powered analysis", included: true },
        { name: "Limited article scans(100/week)", included: true },
        { name: "Limited media scans (10/week)", included: true },
        { name: "Source credibility scoring", included: true },
        { name: "Browser extension", included: true },
        { name: "Detailed analysis reports", included: true },
        { name: "Unlimited scans", included: false },
        { name: "Priority updates", included: false },
        { name: "API access", included: false},
      ],
      cta: "Get Starter",
      popular: true,
      color: "from-primary to-purple-600",
    },
    {
      name: "Premium",
      description: "Complete solution for organizations",
      monthlyPrice: "₹249",
      yearlyPrice: "₹2199",
      yearlyDiscount: "Save 25%",
      features: [
        { name: "All Premium features", included: true },
        { name: "API access", included: true },
        { name: "Unlimited article scans", included: true },
        { name: "100 media scans/week", included: true},
        { name: "Priority updates", included: true},
        { name: "Custom integration options", included: true },
        { name: "Dedicated support", included: true },
        { name: "Custom reporting", included: true },
      ],
      cta: "Get Premium",
      popular: false,
      color: "from-indigo-500 to-indigo-600",
    },
  ]

  return (
    <section id="pricing" className="py-20 min-h-screen flex items-center" ref={sectionRef}>
      <div
        className={cn(
          "container transition-all duration-1000 transform",
          isVisible ? "translate-y-0 opacity-100" : "translate-y-10 opacity-0",
        )}
      >
        <div className="text-center mb-16">
          <Badge className="mb-4 px-3 py-1 text-sm bg-gradient-to-r from-primary/20 to-purple-600/20 hover:from-primary/30 hover:to-purple-600/30 transition-colors">
            Pricing
          </Badge>
          <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl mb-4">
            Choose Your{" "}
            <span className="bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent animate-gradient">
              Protection
            </span>{" "}
            Level
          </h2>
          <p className="text-xl text-foreground/70 max-w-2xl mx-auto">
            Flexible plans designed to meet your needs. All plans include core TruthScope features.
          </p>

          <div className="flex items-center justify-center mt-8 mb-12">
            <div className="bg-muted rounded-full p-1 flex items-center">
              <button
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-medium transition-all duration-300",
                  !isYearly ? "bg-background shadow-md text-primary" : "text-foreground/60 hover:text-foreground",
                )}
                onClick={() => setIsYearly(false)}
              >
                Monthly
              </button>
              <button
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-medium transition-all duration-300",
                  isYearly ? "bg-background shadow-md text-primary" : "text-foreground/60 hover:text-foreground",
                )}
                onClick={() => setIsYearly(true)}
              >
                Yearly
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-8 md:grid-cols-3 max-w-6xl mx-auto perspective">
          {plans.map((plan, index) => (
            <div
              key={index}
              className="perspective"
              style={{
                perspective: "1000px",
                transformStyle: "preserve-3d",
              }}
            >
              <Card
                className={cn(
                  "relative overflow-hidden transition-all duration-500 hover:shadow-xl",
                  plan.popular
                    ? "border-primary shadow-lg scale-105 md:scale-110 z-10"
                    : "border-border shadow hover:scale-105",
                )}
                style={{
                  transform: isVisible ? "rotateY(0) translateZ(0)" : "rotateY(-15deg) translateZ(-50px)",
                  transition: "transform 0.8s ease-out, box-shadow 0.3s ease-out, scale 0.3s ease-out",
                  transitionDelay: `${index * 100}ms`,
                }}
              >
                {plan.popular && (
                  <div className="absolute top-0 right-0">
                    <div className="bg-gradient-to-r from-primary to-purple-600 text-primary-foreground text-xs font-medium px-3 py-1 rounded-bl-lg">
                      Most Popular
                    </div>
                  </div>
                )}

                <CardContent className="p-6 pt-8">
                  <div className="mb-4">
                    <h3 className="text-2xl font-bold">{plan.name}</h3>
                    <p className="text-foreground/70">{plan.description}</p>
                  </div>
                  <div className="mb-6">
                    <span className="text-4xl font-bold bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
                      {isYearly ? plan.yearlyPrice : plan.monthlyPrice}
                    </span>
                    {(isYearly ? plan.yearlyPrice : plan.monthlyPrice) !== "Custom" && (
                      <span className="text-foreground/70">{isYearly ? "/year" : "/month"}</span>
                    )}
                    {isYearly && plan.yearlyDiscount && (
                      <div className="mt-1">
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                          {plan.yearlyDiscount}
                        </Badge>
                      </div>
                    )}
                  </div>
                  <ul className="space-y-3 mb-6">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-start">
                        {feature.included ? (
                          <Check className="h-5 w-5 text-green-500 shrink-0 mr-2" />
                        ) : (
                          <X className="h-5 w-5 text-foreground/30 shrink-0 mr-2" />
                        )}
                        <span className={feature.included ? "" : "text-foreground/50"}>{feature.name}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter className="p-6 pt-0">
                  <Button
                    className={cn(
                      "w-full group",
                      plan.popular
                        ? `bg-gradient-to-r ${plan.color} hover:opacity-90 transition-opacity shadow-lg hover:shadow-primary/20`
                        : "bg-muted-foreground/80 hover:bg-muted-foreground shadow-md hover:shadow-lg",
                    )}
                    variant={plan.popular ? "default" : "secondary"}
                  >
                    {plan.cta}
                    <ChevronRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </Button>
                </CardFooter>
              </Card>
            </div>
          ))}
        </div>

        <div className="mt-16 text-center">
          <p className="text-foreground/70 mb-4">Need a custom solution for your organization?</p>
          <Button
            variant="outline"
            size="lg"
            className="border-primary/20 hover:border-primary/40 transition-colors shadow-sm hover:shadow-md"
          >
            Contact Our Sales Team
          </Button>
        </div>
      </div>
    </section>
  )
} 
