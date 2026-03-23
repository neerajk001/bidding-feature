'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

interface TermsAndConditionsModalProps {
  showAgreementText?: boolean
  wrapperClassName?: string
  triggerClassName?: string
}

export default function TermsAndConditionsModal({
  showAgreementText = true,
  wrapperClassName,
  triggerClassName,
}: TermsAndConditionsModalProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  useEffect(() => {
    if (!isOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [isOpen])

  const buttonClassName =
    triggerClassName || 'text-blue-600 underline underline-offset-2 hover:text-blue-700 font-medium'

  const trigger = (
    <button
      type="button"
      onClick={() => setIsOpen(true)}
      className={buttonClassName}
    >
      Terms and Conditions
    </button>
  )

  return (
    <>
      {showAgreementText ? (
        <p className="text-gray-600 text-sm mt-8">
          By participating, you agree to our {trigger}.
        </p>
      ) : (
        <div className={wrapperClassName}>{trigger}</div>
      )}

      {isMounted && isOpen && createPortal(
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close terms modal overlay"
            className="absolute inset-0 bg-black/60"
            onClick={() => setIsOpen(false)}
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="terms-modal-title"
            className="relative z-[1001] w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl bg-white border border-gray-200 shadow-2xl"
          >
            <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 flex items-center justify-between">
              <h3 id="terms-modal-title" className="text-lg lg:text-xl font-bold text-black font-display">
                Terms and Conditions
              </h3>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-300 text-gray-700 hover:bg-gray-50"
                aria-label="Close terms modal"
              >
                x
              </button>
            </div>

            <div className="px-5 py-5 text-sm text-gray-700 space-y-4 leading-relaxed">
              <ol className="list-decimal list-inside space-y-3">
                <li><strong>Registration:</strong> You must register before the registration window closes. Only registered bidders can place bids.</li>
                <li><strong>Verification:</strong> Registration is allowed only after account verification as required by the platform.</li>
                <li><strong>Bidding window:</strong> Bids are accepted only between the published bidding start and end time.</li>
                <li><strong>Minimum increment:</strong> Every new bid must be at least the current highest bid plus the configured minimum increment.</li>
                <li><strong>Size-based lots:</strong> For auctions with sizes, winners are determined separately by size.</li>
                <li><strong>Binding bids:</strong> All bids are final and legally binding.</li>
                <li><strong>Winner payment:</strong> Winners receive a secure payment link and must complete payment within 12 hours.</li>
                <li><strong>Payment method:</strong> Winner payments are processed through Razorpay checkout.</li>
                <li><strong>Non-payment:</strong> If payment is not completed in time, the win is forfeited and the lot may be offered to the next eligible bidder.</li>
                <li><strong>Shipping and fulfillment:</strong> Shipping is included where stated, and dispatch is typically within 2-3 working days after payment confirmation.</li>
                <li><strong>No cancellation:</strong> Bids and completed purchases cannot be cancelled, returned, or exchanged unless required by applicable law.</li>
              </ol>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
