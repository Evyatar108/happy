export function CopyToast({ text }: { text: string | null }) {
    if (!text) return null
    return (
        <div className="copy-toast" role="status" aria-live="polite">
            {text}
        </div>
    )
}

