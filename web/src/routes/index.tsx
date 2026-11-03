// function Home() {
//   return (
//     <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
//       <h1>Bill Splitter — starter</h1>
//       <p>
//         Replace this with the app. See <code>README.md</code> at the repo root.
//       </p>
//     </main>
//   )
// }

import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'

export const Route = createFileRoute('/')({
  component: App,
})

// Types matching the API
interface Home {
  id: string
  name: string
  created_at: string
}

interface Share {
  id: string
  billId: string
  memberId: string
  amountCents: number
  paidAt: string | null
  memberName: string
}

interface Bill {
  id: string
  homeId: string
  title: string
  totalCents: number
  createdAt: string
  shares: Share[]
}

interface Balance {
  memberId: string
  name: string
  outstandingCents: number
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)} (${cents}¢)`
}

function App() {
  const [homes, setHomes] = useState<Home[]>([])
  const [selectedHomeId, setSelectedHomeId] = useState<string>('')
  const [bills, setBills] = useState<Bill[]>([])
  const [balances, setBalances] = useState<Balance[]>([])

  // UI States
  const [isLoadingHomes, setIsLoadingHomes] = useState(true)
  const [isLoadingData, setIsLoadingData] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [payingShareId, setPayingShareId] = useState<string | null>(null)

  // Forms
  const [newHomeName, setNewHomeName] = useState('')
  const [newMemberName, setNewMemberName] = useState('')
  const [newBillTitle, setNewBillTitle] = useState('')
  const [newBillCents, setNewBillCents] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  // 1. Fetch homes on load
  const loadHomes = useCallback(async () => {
    setIsLoadingHomes(true)
    setError(null)
    try {
      const res = await fetch('/api/homes')
      if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to load homes`)
      const data = (await res.json()) as { homes?: Home[] }
      const list = data.homes ?? []
      setHomes(list)
      const firstHome = list[0]
      if (firstHome) {
        setSelectedHomeId((prev) => prev || firstHome.id)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to connect to API')
    } finally {
      setIsLoadingHomes(false)
    }
  }, [])

  useEffect(() => {
    loadHomes()
  }, [loadHomes])

  // 2. Fetch bills and balances when selected home changes
  const loadHomeData = useCallback(async (homeId: string) => {
    if (!homeId) return
    setIsLoadingData(true)
    setError(null)
    try {
      const [billsRes, balancesRes] = await Promise.all([
        fetch(`/api/homes/${homeId}/bills`),
        fetch(`/api/homes/${homeId}/balances`),
      ])

      if (!billsRes.ok) {
        const errJson = (await billsRes.json().catch(() => ({}))) as { error?: string }
        throw new Error(errJson.error || `HTTP ${billsRes.status} loading bills`)
      }
      if (!balancesRes.ok) {
        const errJson = (await balancesRes.json().catch(() => ({}))) as { error?: string }
        throw new Error(errJson.error || `HTTP ${balancesRes.status} loading balances`)
      }

      const billsData = (await billsRes.json()) as { bills: Bill[] }
      const balancesData = (await balancesRes.json()) as { balances: Balance[] }

      setBills(billsData.bills ?? [])
      setBalances(balancesData.balances ?? [])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred loading data')
    } finally {
      setIsLoadingData(false)
    }
  }, [])

  useEffect(() => {
    if (selectedHomeId) {
      loadHomeData(selectedHomeId)
    } else {
      setBills([])
      setBalances([])
    }
  }, [selectedHomeId, loadHomeData])

  // 3. Create a Home
  const handleCreateHome = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newHomeName.trim()) return
    setFormError(null)
    try {
      const res = await fetch('/api/homes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newHomeName.trim() }),
      })
      const data = (await res.json()) as { id?: string; error?: string }
      if (!res.ok) throw new Error(data.error || 'Failed to create home')

      setNewHomeName('')
      await loadHomes()
      if (data.id) setSelectedHomeId(data.id)
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Error creating home')
    }
  }

  // 4. Add a Member
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedHomeId || !newMemberName.trim()) return
    setFormError(null)
    try {
      const res = await fetch(`/api/homes/${selectedHomeId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newMemberName.trim() }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error || 'Failed to add member')

      setNewMemberName('')
      await loadHomeData(selectedHomeId)
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Error adding member')
    }
  }

  // 5. Create a Bill
  const handleCreateBill = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedHomeId) return
    const cents = Number(newBillCents)
    if (!newBillTitle.trim() || Number.isNaN(cents) || cents <= 0 || !Number.isInteger(cents)) {
      setFormError('Total must be a positive integer in cents (e.g. 1000 for $10.00)')
      return
    }

    setFormError(null)
    try {
      const res = await fetch(`/api/homes/${selectedHomeId}/bills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newBillTitle.trim(),
          totalCents: cents,
        }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error || 'Failed to create bill')

      setNewBillTitle('')
      setNewBillCents('')
      await loadHomeData(selectedHomeId)
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Error creating bill')
    }
  }

  // 6. Pay a Share (Idempotent, Concurrency-safe)
  const handlePayShare = async (billId: string, shareId: string) => {
    setPayingShareId(shareId)
    setFormError(null)
    try {
      const idempotencyKey = crypto.randomUUID()
      const res = await fetch(`/api/bills/${billId}/shares/${shareId}/pay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
      })

      const data = (await res.json()) as {
        id?: string
        paidAt?: string
        error?: string
      }

      if (!res.ok) {
        // Keeps the share unpaid and surfaces error
        throw new Error(data.error || `Payment failed (Status: ${res.status})`)
      }

      // Optimistically update the share in state and refresh balances
      setBills((prevBills) =>
        prevBills.map((b) => {
          if (b.id !== billId) return b
          return {
            ...b,
            shares: b.shares.map((s) =>
              s.id === shareId ? { ...s, paidAt: data.paidAt ?? new Date().toISOString() } : s,
            ),
          }
        }),
      )

      // Refresh balances in the background
      const balRes = await fetch(`/api/homes/${selectedHomeId}/balances`)
      if (balRes.ok) {
        const balData = (await balRes.json()) as { balances: Balance[] }
        setBalances(balData.balances ?? [])
      }
    } catch (err: unknown) {
      // Keeps share unpaid and alerts user
      setFormError(err instanceof Error ? err.message : 'Payment request failed')
    } finally {
      setPayingShareId(null)
    }
  }

  return (
    <div
      style={{
        maxWidth: 960,
        margin: '0 auto',
        padding: '32px 20px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        color: '#1e293b',
      }}
    >
      <header
        style={{
          borderBottom: '1px solid #e2e8f0',
          paddingBottom: 16,
          marginBottom: 24,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: '#0f172a' }}>
            Shared Bill Splitter
          </h1>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 14 }}>
            Fair, transparent bill sharing for your home
          </p>
        </div>
      </header>

      {/* Global Error Banner */}
      {error && (
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#991b1b',
            padding: '12px 16px',
            borderRadius: 8,
            marginBottom: 20,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>
            <strong>Error:</strong> {error}
          </span>
          <button
            type="button"
            onClick={() => (selectedHomeId ? loadHomeData(selectedHomeId) : loadHomes())}
            style={{
              background: '#991b1b',
              color: '#fff',
              border: 'none',
              padding: '6px 12px',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Action / Validation Error Alert */}
      {formError && (
        <div
          style={{
            background: '#fffbeb',
            border: '1px solid #fde68a',
            color: '#92400e',
            padding: '12px 16px',
            borderRadius: 8,
            marginBottom: 20,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>
            <strong>Notice:</strong> {formError}
          </span>
          <button
            type="button"
            onClick={() => setFormError(null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#92400e',
              cursor: 'pointer',
              fontSize: 16,
              fontWeight: 'bold',
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Top Grid: Home & Member Selection */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 20,
          marginBottom: 28,
        }}
      >
        {/* Select / Create Home */}
        <div
          style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            padding: 18,
          }}
        >
          <h2 style={{ fontSize: 16, margin: '0 0 12px', fontWeight: 600 }}>
            1. Select or Create Home
          </h2>
          {isLoadingHomes ? (
            <p style={{ color: '#64748b', fontSize: 14 }}>Loading homes...</p>
          ) : (
            <>
              {homes.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <label
                    htmlFor="home-select"
                    style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4 }}
                  >
                    Active Home
                  </label>
                  <select
                    id="home-select"
                    value={selectedHomeId}
                    onChange={(e) => setSelectedHomeId(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: 6,
                      border: '1px solid #cbd5e1',
                      fontSize: 14,
                    }}
                  >
                    {homes.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <form onSubmit={handleCreateHome} style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  placeholder="New Home (e.g. Flat 4B)"
                  value={newHomeName}
                  onChange={(e) => setNewHomeName(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '8px 10px',
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    fontSize: 14,
                  }}
                />
                <button
                  type="submit"
                  style={{
                    background: '#2563eb',
                    color: '#fff',
                    border: 'none',
                    padding: '8px 14px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  Create
                </button>
              </form>
            </>
          )}
        </div>

        {/* Members & Balances */}
        <div
          style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            padding: 18,
          }}
        >
          <h2 style={{ fontSize: 16, margin: '0 0 12px', fontWeight: 600 }}>
            2. Members & Balances
          </h2>
          {!selectedHomeId ? (
            <p style={{ color: '#94a3b8', fontSize: 14 }}>Select a home first</p>
          ) : (
            <>
              {balances.length === 0 ? (
                <p
                  style={{
                    color: '#d97706',
                    fontSize: 13,
                    background: '#fef3c7',
                    padding: '8px 12px',
                    borderRadius: 6,
                    margin: '0 0 12px',
                  }}
                >
                  No members yet. Add at least one member to split bills!
                </p>
              ) : (
                <div style={{ marginBottom: 12 }}>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {balances.map((b) => (
                      <li
                        key={b.memberId}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          padding: '6px 0',
                          borderBottom: '1px dashed #e2e8f0',
                          fontSize: 14,
                        }}
                      >
                        <span style={{ fontWeight: 500 }}>{b.name}</span>
                        <span
                          style={{
                            color: b.outstandingCents > 0 ? '#b91c1c' : '#15803d',
                            fontWeight: 600,
                          }}
                        >
                          {b.outstandingCents > 0
                            ? `Owes ${formatCents(b.outstandingCents)}`
                            : 'All Paid Up'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <form onSubmit={handleAddMember} style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  placeholder="New Member (e.g. Asha)"
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '8px 10px',
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    fontSize: 14,
                  }}
                />
                <button
                  type="submit"
                  style={{
                    background: '#0f172a',
                    color: '#fff',
                    border: 'none',
                    padding: '8px 14px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  Add
                </button>
              </form>
            </>
          )}
        </div>
      </div>

      {/* Bill Creation Form */}
      {selectedHomeId && (
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            padding: 20,
            marginBottom: 28,
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}
        >
          <h2 style={{ fontSize: 17, margin: '0 0 14px', fontWeight: 600 }}>3. Split a New Bill</h2>
          <form onSubmit={handleCreateBill} style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <input
              type="text"
              placeholder="Bill Title (e.g. Electricity, WiFi)"
              value={newBillTitle}
              onChange={(e) => setNewBillTitle(e.target.value)}
              style={{
                flex: 2,
                minWidth: 180,
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                fontSize: 14,
              }}
            />
            <input
              type="number"
              placeholder="Total in Cents (e.g. 3000 for $30)"
              value={newBillCents}
              onChange={(e) => setNewBillCents(e.target.value)}
              style={{
                flex: 1,
                minWidth: 160,
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                fontSize: 14,
              }}
            />
            <button
              type="submit"
              disabled={balances.length === 0}
              style={{
                background: balances.length === 0 ? '#94a3b8' : '#059669',
                color: '#fff',
                border: 'none',
                padding: '8px 18px',
                borderRadius: 6,
                cursor: balances.length === 0 ? 'not-allowed' : 'pointer',
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              Split Bill
            </button>
          </form>
          {balances.length === 0 && (
            <p style={{ margin: '8px 0 0', fontSize: 12, color: '#dc2626' }}>
              Cannot split bill: This home has no members. Add members above first.
            </p>
          )}
        </div>
      )}

      {/* Bills & Shares List */}
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 16px', color: '#0f172a' }}>
          Bills & Shares
        </h2>

        {isLoadingData ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748b' }}>
            <p style={{ fontSize: 15 }}>Loading bills and shares...</p>
          </div>
        ) : !selectedHomeId ? (
          <div
            style={{
              textAlign: 'center',
              padding: '40px 20px',
              background: '#f8fafc',
              borderRadius: 8,
              color: '#64748b',
            }}
          >
            <p style={{ margin: 0 }}>Please select or create a home above to view bills.</p>
          </div>
        ) : bills.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '40px 20px',
              background: '#f8fafc',
              borderRadius: 8,
              color: '#64748b',
              border: '1px dashed #cbd5e1',
            }}
          >
            <p style={{ margin: 0, fontWeight: 500 }}>No bills created yet for this home.</p>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8' }}>
              Use the form above to split your first bill.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {bills.map((bill) => (
              <div
                key={bill.id}
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 10,
                  padding: 20,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: 14,
                  }}
                >
                  <div>
                    <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#0f172a' }}>
                      {bill.title}
                    </h3>
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>
                      Created: {new Date(bill.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
                      {formatCents(bill.totalCents)}
                    </span>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#64748b',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      marginBottom: 8,
                    }}
                  >
                    Member Shares
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                      gap: 10,
                    }}
                  >
                    {bill.shares.map((share) => {
                      const isPaid = share.paidAt !== null
                      const isPaying = payingShareId === share.id

                      return (
                        <div
                          key={share.id}
                          style={{
                            background: isPaid ? '#f0fdf4' : '#fefce8',
                            border: `1px solid ${isPaid ? '#bbf7d0' : '#fef08a'}`,
                            borderRadius: 8,
                            padding: '10px 14px',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            gap: 8,
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                            }}
                          >
                            <span style={{ fontWeight: 600, fontSize: 14 }}>
                              {share.memberName}
                            </span>
                            <span style={{ fontWeight: 700, fontSize: 14 }}>
                              {formatCents(share.amountCents)}
                            </span>
                          </div>

                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              marginTop: 4,
                            }}
                          >
                            {isPaid ? (
                              <span
                                style={{
                                  fontSize: 12,
                                  background: '#22c55e',
                                  color: '#ffffff',
                                  padding: '3px 8px',
                                  borderRadius: 4,
                                  fontWeight: 600,
                                }}
                              >
                                ✓ Paid
                              </span>
                            ) : (
                              <span
                                style={{
                                  fontSize: 12,
                                  background: '#f59e0b',
                                  color: '#ffffff',
                                  padding: '3px 8px',
                                  borderRadius: 4,
                                  fontWeight: 600,
                                }}
                              >
                                Unpaid
                              </span>
                            )}

                            {!isPaid && (
                              <button
                                type="button"
                                onClick={() => handlePayShare(bill.id, share.id)}
                                disabled={isPaying}
                                style={{
                                  background: isPaying ? '#94a3b8' : '#2563eb',
                                  color: '#ffffff',
                                  border: 'none',
                                  padding: '5px 12px',
                                  borderRadius: 5,
                                  fontSize: 12,
                                  fontWeight: 600,
                                  cursor: isPaying ? 'wait' : 'pointer',
                                }}
                              >
                                {isPaying ? 'Paying...' : 'Pay Share'}
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
