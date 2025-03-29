"use client"

import { useState, useEffect, useRef } from "react"
import Image from "next/image"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Shield, BarChart, Zap, Award, AlertTriangle, CheckCircle, Brain, Lock } from "lucide-react"
import { cn } from "@/lib/utils"

export function FeaturesSection() {
  const [isVisible, setIsVisible] = useState(false)
  const [activeFeature, setActiveFeature] = useState(0)
  const [hoveredFeature, setHoveredFeature] = useState<number | null>(null)
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
    if (!isVisible) return

    const interval = setInterval(() => {
      if (hoveredFeature === null) {
        setActiveFeature((prev) => (prev + 1) % features.length)
      }
    }, 4000)

    return () => clearInterval(interval)
  }, [isVisible, hoveredFeature])

  const features = [
    {
      icon: Shield,
      title: "Real-time Detection",
      description: "Instantly analyze news articles and social media posts for signs of misinformation as you browse.",
      color: "from-blue-500 to-blue-600",
      bgColor: "bg-blue-100",
      iconColor: "text-blue-500",
      image: "/placeholder.svg?height=400&width=600&text=Real-time+Detection",
    },
    {
      icon: BarChart,
      title: "Source Credibility Scoring",
      description:
        "Each source receives a trust score based on historical accuracy, transparency, and expert evaluations.",
      color: "from-purple-500 to-purple-600",
      bgColor: "bg-purple-100",
      iconColor: "text-purple-500",
      image: "/placeholder.svg?height=400&width=600&text=Credibility+Scoring",
    },
    {
      icon: Zap,
      title: "AI-Powered Analysis",
      description:
        "Our advanced algorithms detect subtle patterns and linguistic cues that indicate potentially misleading content.",
      color: "from-amber-500 to-amber-600",
      bgColor: "bg-amber-100",
      iconColor: "text-amber-500",
      image: "/placeholder.svg?height=400&width=600&text=AI+Analysis",
    },
    {
      icon: Award,
      title: "Fact-Check Integration",
      description: "Access verified fact-checks from reputable organizations directly within your browser.",
      color: "from-green-500 to-green-600",
      bgColor: "bg-green-100",
      iconColor: "text-green-500",
      image: "/placeholder.svg?height=400&width=600&text=Fact-Check+Integration",
    },
    {
      icon: AlertTriangle,
      title: "Bias Detection",
      description: "Identify political and ideological bias in news articles to get a more balanced perspective.",
      color: "from-red-500 to-red-600",
      bgColor: "bg-red-100",
      iconColor: "text-red-500",
      image: "/placeholder.svg?height=400&width=600&text=Bias+Detection",
    },
    {
      icon: CheckCircle,
      title: "Verification Tools",
      description: "Easily verify quotes, statistics, and claims with our integrated verification tools.",
      color: "from-teal-500 to-teal-600",
      bgColor: "bg-teal-100",
      iconColor: "text-teal-500",
      image: "/placeholder.svg?height=400&width=600&text=Verification+Tools",
    },
    {
      icon: Brain,
      title: "Educational Resources",
      description: "Learn to identify misinformation on your own with our educational resources and guides.",
      color: "from-indigo-500 to-indigo-600",
      bgColor: "bg-indigo-100",
      iconColor: "text-indigo-500",
      image: "/placeholder.svg?height=400&width=600&text=Educational+Resources",
    },
    {
      icon: Lock,
      title: "Privacy Protection",
      description: "Your browsing data stays private. We analyze content locally without tracking your activity.",
      color: "from-slate-500 to-slate-600",
      bgColor: "bg-slate-100",
      iconColor: "text-slate-500",
      image: "/placeholder.svg?height=400&width=600&text=Privacy+Protection",
    },
  ]

  return (
    <section id="features" className="py-20 min-h-screen flex items-center" ref={sectionRef}>
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
            <span className="bg-gradient-to-r from-primary p-0.5 to-purple-600 bg-clip-text text-transparent animate-gradient">
              TruthScope
            </span>{" "}
            Protects You
          </h2>
          <p className="text-xl text-foreground/70 max-w-2xl mx-auto">
            Our powerful tools work together to shield you from misinformation and help you make informed decisions.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {features.map((feature, index) => {
            const Icon = feature.icon
            return (
              <div
                key={index}
                className="perspective"
                onMouseEnter={() => setHoveredFeature(index)}
                onMouseLeave={() => setHoveredFeature(null)}
                onClick={() => setActiveFeature(index)}
              >
                <Card
                  className={cn(
                    "relative overflow-hidden border-none shadow-lg bg-background cursor-pointer transition-all duration-500",
                    activeFeature === index
                      ? "ring-2 ring-primary ring-offset-2 ring-offset-background scale-[1.02] z-10"
                      : "hover:shadow-xl hover:scale-[1.05]",
                    hoveredFeature === index && "shadow-xl",
                  )}
                  style={{
                    transform: `perspective(1000px) rotateY(${hoveredFeature === index ? "5deg" : "0"}) rotateX(${hoveredFeature === index ? "-5deg" : "0"})`,
                    transformStyle: "preserve-3d",
                  }}
                >
                  <div className="p-6 relative z-10">
                    <div
                      className={cn("mb-4 rounded-full p-3 w-fit transition-colors duration-300", feature.bgColor)}
                      style={{
                        transform: hoveredFeature === index ? "translateZ(20px)" : "translateZ(0)",
                        transition: "transform 0.3s ease-out",
                      }}
                    >
                      <Icon className={cn("h-10 w-10", feature.iconColor)} />
                    </div>
                    <h3
                      className="text-xl font-bold mb-2"
                      style={{
                        transform: hoveredFeature === index ? "translateZ(15px)" : "translateZ(0)",
                        transition: "transform 0.3s ease-out",
                      }}
                    >
                      {feature.title}
                    </h3>
                    <p
                      className="text-foreground/70"
                      style={{
                        transform: hoveredFeature === index ? "translateZ(10px)" : "translateZ(0)",
                        transition: "transform 0.3s ease-out",
                      }}
                    >
                      {feature.description}
                    </p>
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
                  </div>

                  {/* 3D effect elements */}
                  <div
                    className="absolute inset-0 bg-gradient-to-tr from-white/5 to-white/20 opacity-0 transition-opacity duration-300 pointer-events-none"
                    style={{
                      opacity: hoveredFeature === index ? 0.1 : 0,
                      transform: "translateZ(5px)",
                    }}
                  />
                  <div
                    className={cn(
                      "absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r opacity-0 transition-opacity duration-300",
                      feature.color,
                    )}
                    style={{
                      opacity: hoveredFeature === index ? 1 : 0,
                    }}
                  />
                </Card>
              </div>
            )
          })}
        </div>

        {/* <div className="mt-20 relative rounded-xl overflow-hidden shadow-2xl">
          <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 to-purple-600/5 z-10 pointer-events-none" />
          <div className="relative transition-all duration-500 transform">
            {features.map((feature, index) => (
              <div
                key={index}
                className={cn(
                  "absolute inset-0 transition-all duration-500",
                  activeFeature === index ? "opacity-100 z-20 transform-none" : "opacity-0 z-10 scale-95",
                )}
              >
                <Image
                  src={feature.image || "/placeholder.svg"}
                  alt={feature.title}
                  width={120}
                  height={60}
                  className="w-full h-auto"
                />
              </div>
            ))}
            <Image
              src={features[0].image || "/placeholder.svg"}
              alt="Feature showcase"
              width={120}
              height={60}
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
        </div> */}
      </div>
    </section>
  )
}