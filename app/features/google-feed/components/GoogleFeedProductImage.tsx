import { Package } from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"

export function GoogleFeedProductImage({
  src,
  large = false,
}: {
  src: string | null
  large?: boolean
}) {
  const [failed, setFailed] = useState(false)
  return (
    <div
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-lg bg-muted",
        large ? "size-16 sm:size-24" : "size-14",
      )}
    >
      {src && !failed ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          className="size-full object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <Package className="size-5 text-muted-foreground" aria-hidden="true" />
      )}
    </div>
  )
}
