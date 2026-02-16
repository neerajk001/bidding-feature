// Admin UI Component Utility Classes
// These are reusable Tailwind class strings for admin panel components

export const adminStyles = {
    // Button Styles
    btn: 'inline-flex items-center justify-center px-6 py-3 rounded-md font-semibold text-sm transition-all duration-200 border disabled:opacity-50 disabled:cursor-not-allowed',
    btnPrimary: 'bg-orange-500 text-white border-orange-500 hover:bg-orange-600 hover:border-orange-600 hover:-translate-y-0.5 shadow-md hover:shadow-lg',
    btnOutline: 'bg-white border-black text-black hover:bg-black hover:text-white',
    btnDanger: 'bg-white text-red-600 border-red-600 hover:bg-red-600 hover:text-white',
    btnSecondary: 'px-5 py-2.5 text-sm border border-black bg-transparent text-black rounded-md hover:bg-black hover:text-white transition-all',

    // Input Styles
    input: 'w-full px-4 py-3 bg-white border border-black rounded-md text-black text-base transition-all focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20',
    select: 'w-full px-4 py-3 bg-white border border-black rounded-md text-black text-base transition-all focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20',
    textarea: 'w-full px-4 py-3 bg-white border border-black rounded-md text-black text-base transition-all focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 resize-y min-h-[100px]',
    label: 'block mb-2 font-semibold text-black text-sm',

    // Card Styles
    card: 'bg-white border border-black rounded-lg p-8 shadow-sm transition-all',

    // Badge Styles
    badge: 'inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide',
    badgeDraft: 'bg-gray-100 text-gray-700 border border-gray-300',
    badgeLive: 'bg-green-100 text-green-700 border border-green-300',
    badgeEnded: 'bg-red-100 text-red-700 border border-red-300',

    // Alert Styles
    alert: 'px-5 py-4 mb-6 rounded-md border font-medium',
    alertSuccess: 'bg-green-100 text-green-700 border-green-300',
    alertError: 'bg-red-100 text-red-700 border-red-300',
    alertInfo: 'bg-blue-100 text-blue-700 border-blue-300',

    // Table Styles
    table: 'w-full border-collapse bg-white mt-4',
    tableHead: 'bg-gray-50 border-b-2 border-black',
    tableTh: 'px-4 py-4 text-left font-bold text-black text-sm uppercase tracking-wide border-b border-black',
    tableTd: 'px-4 py-4 text-gray-700 text-sm align-middle',
    tableRow: 'border-b border-gray-200 last:border-b-0',

    // Form Styles
    formGroup: 'mb-6',
    formActions: 'flex gap-4 pt-6 border-t border-gray-200 mt-6',

    // Layout Styles
    header: 'bg-white border-b border-black px-0 py-4 sticky top-0 z-50 shadow-sm',
    content: 'px-8 py-10 max-w-7xl mx-auto',
    sectionTitle: 'text-3xl text-black font-bold m-0',

    // File Input
    fileInput: 'block w-full px-3 py-3 border border-black rounded-md bg-white cursor-pointer transition-all hover:border-orange-500',

    // Image/Video Preview
    imagePreview: 'w-full max-w-xs h-32 object-cover rounded-md border border-black mt-3',
    videoPreview: 'w-full max-w-xs h-48 rounded-md border border-black mt-3',

    // Helper Text
    helperText: 'text-sm text-gray-600 mt-2 block',

    // Empty State
    emptyState: 'text-center px-8 py-16 bg-gray-50 border border-dashed border-black rounded-lg',

    // Nav Link
    navLink: 'px-5 py-2.5 text-sm border border-black bg-transparent text-black rounded-md hover:bg-black hover:text-white transition-all font-semibold',

    // Auction List
    auctionList: 'grid gap-6',
    auctionItem: 'flex justify-between items-center px-6 py-6 bg-white border border-black rounded-lg transition-all',
    auctionTitle: 'm-0 mb-2 text-xl font-bold text-black flex items-center gap-3',
    auctionMeta: 'grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-4 mt-4 pt-4 border-t border-gray-200',
    metaLabel: 'text-xs text-gray-600 uppercase tracking-wide mb-1',
    metaValue: 'font-semibold text-black',
}

// Helper function to combine admin styles
export function cn(...classes: (string | undefined | null | false)[]): string {
    return classes.filter(Boolean).join(' ')
}
