"use client"

import { useState, useEffect, useRef } from "react"
import Image from "next/image"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Shield, BarChart, Zap, Award, AlertTriangle, CheckCircle, Brain, Lock } from "lucide-react"
import { cn } from "@/lib/utils"

export function FeaturesSection() {
  const [isVisible, setIsVisible] = useState(false)
  const [activeFeature, setActiveFeature] = useState(0)
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

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveFeature((prev) => (prev + 1) % features.length)
    }, 5000)

    return () => clearInterval(interval)
  }, [])

  const features = [
    {
      icon: <Shield className="h-10 w-10" />,
      title: "Real-time Detection",
      description: "Instantly analyze news articles and social media posts for signs of misinformation as you browse.",
      color: "from-blue-500 to-blue-600",
      image: "/placeholder.svg?height=400&width=600&text=Real-time+Detection",
    },
    {
      icon: <BarChart className="h-10 w-10" />,
      title: "Source Credibility Scoring",
      description:
        "Each source receives a trust score based on historical accuracy, transparency, and expert evaluations.",
      color: "from-purple-500 to-purple-600",
      image: "/placeholder.svg?height=400&width=600&text=Credibility+Scoring",
    },
    {
      icon: <Zap className="h-10 w-10" />,
      title: "AI-Powered Analysis",
      description:
        "Our advanced algorithms detect subtle patterns and linguistic cues that indicate potentially misleading content.",
      color: "from-amber-500 to-amber-600",
      image: "/placeholder.svg?height=400&width=600&text=AI+Analysis",
    },
    {
      icon: <Award className="h-10 w-10" />,
      title: "Fact-Check Integration",
      description: "Access verified fact-checks from reputable organizations directly within your browser.",
      color: "from-green-500 to-green-600",
      image: "/placeholder.svg?height=400&width=600&text=Fact-Check+Integration",
    },
    {
      icon: <AlertTriangle className="h-10 w-10" />,
      title: "Bias Detection",
      description: "Identify political and ideological bias in news articles to get a more balanced perspective.",
      color: "from-red-500 to-red-600",
      image: "/placeholder.svg?height=400&width=600&text=Bias+Detection",
    },
    {
      icon: <CheckCircle className="h-10 w-10" />,
      title: "Verification Tools",
      description: "Easily verify quotes, statistics, and claims with our integrated verification tools.",
      color: "from-teal-500 to-teal-600",
      image: "/placeholder.svg?height=400&width=600&text=Verification+Tools",
    },
    {
      icon: <Brain className="h-10 w-10" />,
      title: "Educational Resources",
      description: "Learn to identify misinformation on your own with our educational resources and guides.",
      color: "from-indigo-500 to-indigo-600",
      image: "/placeholder.svg?height=400&width=600&text=Educational+Resources",
    },
    {
      icon: <Lock className="h-10 w-10" />,
      title: "Privacy Protection",
      description: "Your browsing data stays private. We analyze content locally without tracking your activity.",
      color: "from-slate-500 to-slate-600",
      image: "/placeholder.svg?height=400&width=600&text=Privacy+Protection",
    },
  ]

  return (
    <section id="features" className="py-20 bg-muted/30" ref={sectionRef}>
      <div
        className={cn(
          "container transition-all duration-1000 transform",
          isVisible ? "translate-y-0 opacity-100" : "translate-y-10 opacity-0",
        )}
      >
        <div className="text-center mb-16">
          <Badge className="mb-4 px-3 py-1 text-sm bg-gradient-to-r from-primary/20 to-purple-600/20 hover:from-primary/30 hover:to-purple-600/30 transition-colors">
            Features
          </Badge>
          <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl mb-4">
            How{" "}
            <span className="bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
              TruthScope
            </span>{" "}
            Protects You
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Our powerful tools work together to shield you from misinformation and help you make informed decisions.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {features.map((feature, index) => (
            <Card
              key={index}
              className={cn(
                "group overflow-hidden border-none shadow-lg hover:shadow-xl transition-all duration-500 bg-background cursor-pointer",
                activeFeature === index ? "ring-2 ring-primary ring-offset-2 ring-offset-background scale-[1.02]" : "",
              )}
              onClick={() => setActiveFeature(index)}
            >
              <CardContent className="p-6">
                <div
                  className={cn(
                    "mb-4 rounded-full p-3 w-fit transition-colors duration-300",
                    `bg-gradient-to-r ${feature.color} bg-clip-text text-transparent`,
                  )}
                >
                  {feature.icon}
                </div>
                <h3 className="text-xl font-bold mb-2">{feature.title}</h3>
                <p className="text-muted-foreground">{feature.description}</p>
                <div
                  className={cn(
                    "w-full h-1 mt-4 rounded-full overflow-hidden",
                    activeFeature === index ? "bg-gradient-to-r from-primary to-purple-600" : "bg-muted",
                  )}
                >
                  {activeFeature === index && (
                    <div
                      className="h-full bg-gradient-to-r from-primary to-purple-600 animate-progress"
                      style={{ width: "100%" }}
                    />
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-20 relative rounded-xl overflow-hidden shadow-2xl">
          <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 to-purple-600/5 z-10 pointer-events-none" />
          <div className="relative transition-all duration-500 transform">
            {features.map((feature, index) => (
              <div
                key={index}
                className={cn(
                  "absolute inset-0 transition-opacity duration-500",
                  activeFeature === index ? "opacity-100 z-20" : "opacity-0 z-10",
                )}
              >
                <Image
                  src={feature.image || "/placeholder.svg"}
                  alt={feature.title}
                  width={1200}
                  height={600}
                  className="w-full h-auto"
                />
              </div>
            ))}
            <Image
              src={features[0].image || "/placeholder.svg"}
              alt="Feature showcase"
              width={1200}
              height={600}
              className="w-full h-auto invisible"
            />
          </div>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-30">
            {features.map((_, index) => (
              <button
                key={index}
                onClick={() => setActiveFeature(index)}
                className={cn(
                  "h-2 rounded-full transition-all duration-300",
                  activeFeature === index ? "w-8 bg-primary" : "w-2 bg-white/50 hover:bg-white/80",
                )}
                aria-label={`View feature ${index + 1}`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

