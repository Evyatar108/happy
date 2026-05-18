function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function linkBlockedOnHtml(html: string, taskIds: string[]): string {
    let linked = html
    taskIds.forEach((taskId) => {
        const pattern = new RegExp(`<code>(${escapeRegExp(taskId)})<\\/code>`, 'g')
        linked = linked.replace(
            pattern,
            `<code><a href="#cmd-${taskId}" title="Jump to ${taskId}" style="color: inherit; text-decoration: underline; text-decoration-style: dotted;">$1</a></code>`,
        )
    })
    return linked
}
