import { Component, type ReactNode } from "react"
import { Button } from "@/components/ui/button"

export class GoogleFeedDataBoundary extends Component<
  { children: ReactNode; compact?: boolean; resetKey?: string },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidUpdate(previous: Readonly<{ resetKey?: string }>) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey)
      this.setState({ failed: false })
  }
  render() {
    if (!this.state.failed) return this.props.children
    if (this.props.compact) return <span aria-label="Compteur indisponible">—</span>
    return (
      <div role="alert" className="flex min-h-40 flex-col items-center justify-center gap-4 p-6">
        <p className="text-sm">Chargement impossible</p>
        <Button variant="outline" onClick={() => this.setState({ failed: false })}>
          Réessayer
        </Button>
      </div>
    )
  }
}
