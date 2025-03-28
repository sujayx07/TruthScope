"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"

export function HeroSection() {
  const [isVisible, setIsVisible] = useState(false)
  const [typedText, setTypedText] = useState("")
  const fullText = "Clarity in a world of misinformation"

  useEffect(() => {
    setIsVisible(true)

    let i = 0
    const typingInterval = setInterval(() => {
      if (i < fullText.length) {
        setTypedText(fullText.substring(0, i + 1))
        i++
      } else {
        clearInterval(typingInterval)
      }
    }, 50)

    return () => clearInterval(typingInterval)
  }, [])

  return (
    <section className="relative overflow-hidden py-20 md:py-32 lg:py-40">
      <div
        className={cn(
          "container relative z-10 transition-all duration-1000 transform",
          isVisible ? "translate-y-0 opacity-100" : "translate-y-10 opacity-0",
        )}
      >
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16 items-center">
          <div className="space-y-6">
            <Badge className="px-3 py-1 text-sm bg-gradient-to-r from-primary/20 to-purple-600/20 hover:from-primary/30 hover:to-purple-600/30 transition-colors">
              Chrome Extension
            </Badge>
            <h1 className="text-4xl font-bold tracking-tighter sm:text-5xl md:text-6xl lg:text-7xl">
              <span className="bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
                TruthScope
              </span>
            </h1>
            <p className="text-xl text-muted-foreground h-6">
              {typedText}
              <span className="animate-pulse">|</span>
            </p>
            <p className="text-lg text-muted-foreground max-w-md">
              Our AI-powered browser extension analyzes news articles and social media posts in real-time, helping you
              identify misinformation with confidence.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button
                size="lg"
                className="group relative overflow-hidden rounded-lg bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90 transition-all duration-300"
              >
                <span className="relative z-10 flex items-center">
                  Add to Chrome
                  <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                </span>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="group border-primary/20 hover:border-primary/40 transition-colors"
              >
                Learn More
                <ArrowRight className="ml-2 h-5 w-5 opacity-0 -translate-x-2 transition-all group-hover:opacity-100 group-hover:translate-x-0" />
              </Button>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex -space-x-2">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="h-8 w-8 rounded-full border-2 border-background bg-muted overflow-hidden transition-transform hover:scale-110 hover:z-10"
                  >
                    <Image src={`/placeholder.svg?height=32&width=32&text=${i}`} alt="User" width={32} height={32} />
                  </div>
                ))}
              </div>
              <div>
                <span className="font-medium">10,000+</span> users trust TruthScope
              </div>
            </div>
          </div>
          <div className="relative">
            <div className="absolute inset-0 bg-grid-pattern opacity-[0.02] pointer-events-none" />
            <div className="relative rounded-lg overflow-hidden shadow-2xl transform transition-all hover:scale-[1.02] duration-500 perspective">
              <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 to-purple-600/5 z-10 pointer-events-none" />
              <div className="relative z-20 p-2 bg-background/80 backdrop-blur-sm rounded-t-lg border-b border-muted flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500"></div>
                  <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                </div>
                <div className="flex-1 text-center text-xs text-muted-foreground">https://news-article.example.com</div>
              </div>
              <div className="relative">
                <Image
                  src="/placeholder.svg?height=600&width=800&text=TruthScope+Extension+Demo"
                  alt="TruthScope Extension"
                  width={800}
                  height={600}
                  className="w-full h-auto"
                />
                <div className="absolute top-4 right-4 bg-background/90 backdrop-blur-sm border border-muted shadow-lg rounded-lg p-4 max-w-[200px] animate-pulse-slow">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-4 w-4 rounded-full bg-yellow-500"></div>
                    <div className="text-sm font-medium">Caution Required</div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    This article contains potentially misleading information. Click for details.
                  </div>
                </div>
              </div>
            </div>
            <div className="absolute -bottom-6 -right-6 h-24 w-24 rounded-full bg-primary/20 blur-2xl" />
            <div className="absolute -top-6 -left-6 h-24 w-24 rounded-full bg-purple-600/20 blur-2xl" />
          </div>
        </div>
      </div>

      <div className="absolute inset-0 bg-grid-pattern opacity-[0.02] pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[500px] rounded-full bg-gradient-to-r from-primary/5 to-purple-600/5 blur-[100px]" />
    </section>
  )
}

