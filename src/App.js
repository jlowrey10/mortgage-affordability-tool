import { useState } from "react";

const RATE = 6.53; // Freddie Mac weekly avg as of May 28, 2026
const TAX_RATE = 0.022; // Lubbock county ~2.2%
const INSURANCE_RATE = 0.0065; // homeowners insurance estimate
const PMI_RATE = 0.0085; // PMI if <20% down

function formatCurrency(n) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function calcMonthlyPayment(principal, annualRate, years = 30) {
  const r = annualRate / 100 / 12;
  const n = years * 12;
  if (r === 0) return principal / n;
  return principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

function runMath(inputs) {
  const { income, debts, downPayment, purchasePrice, creditScore } = inputs;
  const grossMonthly = income / 12;
  const loanAmount = purchasePrice - downPayment;
  const downPct = downPayment / purchasePrice;
  const pi = calcMonthlyPayment(loanAmount, RATE);
  const monthlyTax = (purchasePrice * TAX_RATE) / 12;
  const monthlyInsurance = (purchasePrice * INSURANCE_RATE) / 12;
  const monthlyPMI = downPct < 0.2 ? (loanAmount * PMI_RATE) / 12 : 0;
  const totalHousing = pi + monthlyTax + monthlyInsurance + monthlyPMI;
  const frontEndRatio = (totalHousing / grossMonthly) * 100;
  const backEndRatio = ((totalHousing + debts) / grossMonthly) * 100;
  const maxBackEnd = 43;
  const maxAffordable = grossMonthly * (maxBackEnd / 100) - debts - monthlyTax - monthlyInsurance - monthlyPMI;
  const maxLoan = maxAffordable > 0 ? (maxAffordable * (Math.pow(1 + RATE/100/12, 360) - 1)) / ((RATE/100/12) * Math.pow(1 + RATE/100/12, 360)) : 0;
  const maxPurchase = maxLoan + downPayment;

  return {
    grossMonthly,
    loanAmount,
    downPct,
    pi,
    monthlyTax,
    monthlyInsurance,
    monthlyPMI,
    totalHousing,
    frontEndRatio,
    backEndRatio,
    maxPurchase,
    creditScore,
  };
}

export default function MortgageAgent() {
  const [step, setStep] = useState(0);
  const [inputs, setInputs] = useState({
    income: "",
    debts: "",
    downPayment: "",
    purchasePrice: "",
    creditScore: "700-739",
  });
  const [result, setResult] = useState(null);
  const [aiResponse, setAiResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fields = [
    { key: "income", label: "Annual Gross Income", placeholder: "75000", prefix: "$", hint: "Before taxes, all sources" },
    { key: "debts", label: "Monthly Debt Payments", placeholder: "450", prefix: "$", hint: "Car loans, student loans, credit cards (minimums)" },
    { key: "purchasePrice", label: "Target Purchase Price", placeholder: "280000", prefix: "$", hint: "What price range are you looking at?" },
    { key: "downPayment", label: "Down Payment Available", placeholder: "15000", prefix: "$", hint: "Cash ready to close, not including reserves" },
    {
      key: "creditScore", label: "Credit Score Range", placeholder: "", prefix: "", hint: "Best estimate is fine",
      isSelect: true,
      options: ["Below 580", "580-619", "620-659", "660-699", "700-739", "740-779", "780+"]
    },
  ];

  const currentField = fields[step];
  const totalSteps = fields.length;

  function handleInput(e) {
    const val = e.target.value;
    setInputs(prev => ({ ...prev, [currentField.key]: currentField.isSelect ? val : val.replace(/[^0-9.]/g, "") }));
    setError("");
  }

  function handleNext() {
    const val = inputs[currentField.key];
    if (!val) { setError("Please fill this in before continuing."); return; }
    if (step < totalSteps - 1) {
      setStep(s => s + 1);
    } else {
      handleSubmit();
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") handleNext();
  }

  async function handleSubmit() {
    setLoading(true);
    setAiResponse("");

    const nums = {
      income: parseFloat(inputs.income),
      debts: parseFloat(inputs.debts),
      downPayment: parseFloat(inputs.downPayment),
      purchasePrice: parseFloat(inputs.purchasePrice),
      creditScore: inputs.creditScore,
    };

    const math = runMath(nums);
    setResult(math);

    const prompt = `You are a straight-talking mortgage advisor helping a buyer in Lubbock, Texas. No fluff, no cheerleading. Be honest but not discouraging. Here are their numbers:

- Gross Monthly Income: ${formatCurrency(math.grossMonthly)}
- Monthly Debts (before housing): ${formatCurrency(nums.debts)}
- Target Purchase Price: ${formatCurrency(nums.purchasePrice)}
- Down Payment: ${formatCurrency(nums.downPayment)} (${(math.downPct * 100).toFixed(1)}% down)
- Loan Amount: ${formatCurrency(math.loanAmount)}
- Estimated Monthly Payment (P&I + tax + insurance${math.monthlyPMI > 0 ? " + PMI" : ""}): ${formatCurrency(math.totalHousing)}
- Front-End DTI (housing only): ${math.frontEndRatio.toFixed(1)}%
- Back-End DTI (housing + debts): ${math.backEndRatio.toFixed(1)}%
- Max Affordable Purchase (at 43% DTI): ${formatCurrency(math.maxPurchase)}
- Credit Score Range: ${nums.creditScore}
- Rate used: ${RATE}% (current 30yr fixed estimate)

Write 3-4 short paragraphs. Tell them:
1. Where they actually stand — are these numbers realistic or not?
2. The biggest risk or red flag in their profile (if any)
3. What they could do to improve their position
4. One honest piece of advice most buyers don't hear

Keep it under 250 words. Sound like a knowledgeable friend, not a bank disclosure. Lubbock context where relevant.`;

    try {
      const response = await fetch("https://eokq37tw9hi33ry.m.pipedream.net", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt }),
      });
      const data = await response.json();
      const text = data.result || data.content?.[0]?.text || "Unable to generate analysis.";
      setAiResponse(text);
    } catch (e) {
      setAiResponse("Connection error: " + e.message);
    }

    setLoading(false);
  }

  function handleReset() {
    setStep(0);
    setInputs({ income: "", debts: "", downPayment: "", purchasePrice: "", creditScore: "700-739" });
    setResult(null);
    setAiResponse("");
    setError("");
  }

  const isLastStep = step === totalSteps - 1;
  const progress = ((step) / totalSteps) * 100;

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0d0d0d",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "'Georgia', 'Times New Roman', serif",
      padding: "24px 16px",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&family=Source+Sans+3:wght@300;400;600&display=swap');
        * { box-sizing: border-box; }
        .card { background: #111; border: 1px solid #2a2a2a; border-radius: 4px; }
        .input-field {
          width: 100%;
          background: #1a1a1a;
          border: 1px solid #333;
          border-radius: 3px;
          color: #f0ebe0;
          font-size: 2rem;
          padding: 12px 16px;
          font-family: 'Source Sans 3', sans-serif;
          font-weight: 300;
          letter-spacing: 0.02em;
          outline: none;
          transition: border-color 0.2s;
        }
        .input-field:focus { border-color: #c8a96e; }
        .input-field::placeholder { color: #444; }
        .btn-primary {
          background: #c8a96e;
          color: #0d0d0d;
          border: none;
          border-radius: 3px;
          padding: 14px 32px;
          font-family: 'Source Sans 3', sans-serif;
          font-size: 0.9rem;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          cursor: pointer;
          transition: background 0.2s, transform 0.1s;
        }
        .btn-primary:hover { background: #d4b87a; transform: translateY(-1px); }
        .btn-primary:disabled { background: #444; color: #666; cursor: default; transform: none; }
        .btn-ghost {
          background: transparent;
          color: #666;
          border: 1px solid #2a2a2a;
          border-radius: 3px;
          padding: 12px 24px;
          font-family: 'Source Sans 3', sans-serif;
          font-size: 0.85rem;
          cursor: pointer;
          transition: color 0.2s, border-color 0.2s;
        }
        .btn-ghost:hover { color: #999; border-color: #444; }
        .stat-box {
          background: #1a1a1a;
          border: 1px solid #2a2a2a;
          border-radius: 3px;
          padding: 16px;
        }
        .select-field {
          width: 100%;
          background: #1a1a1a;
          border: 1px solid #333;
          border-radius: 3px;
          color: #f0ebe0;
          font-size: 1.4rem;
          padding: 14px 16px;
          font-family: 'Source Sans 3', sans-serif;
          font-weight: 300;
          outline: none;
          cursor: pointer;
          appearance: none;
          transition: border-color 0.2s;
        }
        .select-field:focus { border-color: #c8a96e; }
        .ai-text {
          color: #c8c0b0;
          font-family: 'Source Sans 3', sans-serif;
          font-size: 0.95rem;
          line-height: 1.75;
          font-weight: 300;
        }
        .dti-bar-bg {
          height: 8px;
          background: #2a2a2a;
          border-radius: 4px;
          overflow: hidden;
        }
        .pulse { animation: pulse 1.5s ease-in-out infinite; }
        @keyframes pulse { 0%,100% { opacity: 0.4; } 50% { opacity: 1; } }
        .fade-in { animation: fadeIn 0.5s ease forwards; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      <div style={{ width: "100%", maxWidth: "560px" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{ color: "#c8a96e", fontFamily: "'Source Sans 3', sans-serif", fontSize: "0.7rem", letterSpacing: "0.25em", textTransform: "uppercase", marginBottom: "8px" }}>
            The Lowrey Group · Lubbock, TX
          </div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", color: "#f0ebe0", fontSize: "1.8rem", fontWeight: 700, margin: 0, lineHeight: 1.2 }}>
            Can You Actually Afford It?
          </h1>
          <p style={{ color: "#666", fontFamily: "'Source Sans 3', sans-serif", fontSize: "0.85rem", marginTop: "8px", fontWeight: 300 }}>
            Real numbers. No sugar coating.
          </p>
        </div>

        {!result ? (
          <div className="card fade-in" style={{ padding: "32px" }}>
            {/* Progress */}
            <div style={{ marginBottom: "28px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "0.75rem", color: "#555", letterSpacing: "0.08em" }}>
                  QUESTION {step + 1} OF {totalSteps}
                </span>
                <span style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "0.75rem", color: "#c8a96e" }}>
                  {Math.round(((step) / totalSteps) * 100)}%
                </span>
              </div>
              <div className="dti-bar-bg">
                <div style={{ height: "100%", width: `${progress}%`, background: "#c8a96e", borderRadius: "4px", transition: "width 0.4s ease" }} />
              </div>
            </div>

            {/* Question */}
            <div style={{ marginBottom: "24px" }}>
              <label style={{ fontFamily: "'Playfair Display', serif", color: "#f0ebe0", fontSize: "1.2rem", display: "block", marginBottom: "6px" }}>
                {currentField.label}
              </label>
              <p style={{ fontFamily: "'Source Sans 3', sans-serif", color: "#555", fontSize: "0.8rem", margin: "0 0 16px", fontWeight: 300, letterSpacing: "0.02em" }}>
                {currentField.hint}
              </p>

              {currentField.isSelect ? (
                <div style={{ position: "relative" }}>
                  <select className="select-field" value={inputs[currentField.key]} onChange={handleInput}>
                    {currentField.options.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                  <div style={{ position: "absolute", right: "16px", top: "50%", transform: "translateY(-50%)", color: "#c8a96e", pointerEvents: "none" }}>▾</div>
                </div>
              ) : (
                <div style={{ position: "relative" }}>
                  {currentField.prefix && (
                    <span style={{ position: "absolute", left: "16px", top: "50%", transform: "translateY(-50%)", color: "#c8a96e", fontSize: "1.8rem", fontFamily: "'Source Sans 3', sans-serif", fontWeight: 300 }}>$</span>
                  )}
                  <input
                    className="input-field"
                    style={{ paddingLeft: currentField.prefix ? "36px" : "16px" }}
                    type="text"
                    inputMode="numeric"
                    placeholder={currentField.placeholder}
                    value={inputs[currentField.key]}
                    onChange={handleInput}
                    onKeyDown={handleKeyDown}
                    autoFocus
                  />
                </div>
              )}

              {error && (
                <p style={{ color: "#e07070", fontFamily: "'Source Sans 3', sans-serif", fontSize: "0.8rem", marginTop: "8px" }}>{error}</p>
              )}
            </div>

            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <button className="btn-primary" onClick={handleNext} style={{ flex: 1 }}>
                {isLastStep ? "Run the Numbers" : "Next →"}
              </button>
              {step > 0 && (
                <button className="btn-ghost" onClick={() => setStep(s => s - 1)}>Back</button>
              )}
            </div>

            <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "0.72rem", color: "#3a3a3a", textAlign: "center", marginTop: "20px", lineHeight: 1.5 }}>
              For educational purposes only. Not a loan commitment. Consult a licensed lender for qualification.
            </p>
          </div>
        ) : (
          <div className="fade-in">
            {/* Numbers breakdown */}
            <div className="card" style={{ padding: "24px", marginBottom: "16px" }}>
              <h2 style={{ fontFamily: "'Playfair Display', serif", color: "#f0ebe0", fontSize: "1.1rem", margin: "0 0 20px", fontWeight: 700 }}>
                Your Numbers
              </h2>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "20px" }}>
                {[
                  { label: "Est. Monthly Payment", value: formatCurrency(result.totalHousing), highlight: true },
                  { label: "Max Purchase Price", value: formatCurrency(result.maxPurchase) },
                  { label: "P&I Only", value: formatCurrency(result.pi) },
                  { label: "Taxes + Insurance", value: formatCurrency(result.monthlyTax + result.monthlyInsurance) },
                  ...(result.monthlyPMI > 0 ? [{ label: "PMI (< 20% down)", value: formatCurrency(result.monthlyPMI), warn: true }] : []),
                ].map((item, i) => (
                  <div key={i} className="stat-box" style={{ borderColor: item.highlight ? "#c8a96e44" : item.warn ? "#e0705044" : "#2a2a2a" }}>
                    <div style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "0.68rem", color: "#555", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "4px" }}>{item.label}</div>
                    <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.3rem", color: item.highlight ? "#c8a96e" : item.warn ? "#e07050" : "#f0ebe0" }}>{item.value}</div>
                  </div>
                ))}
              </div>

              {/* DTI gauges */}
              {[
                { label: "Front-End DTI (housing only)", value: result.frontEndRatio, max: 50, good: 28 },
                { label: "Back-End DTI (all debts)", value: result.backEndRatio, max: 60, good: 43 },
              ].map((dti, i) => {
                const pct = Math.min((dti.value / dti.max) * 100, 100);
                const color = dti.value <= dti.good ? "#6eb87a" : dti.value <= dti.good * 1.15 ? "#e0b050" : "#e07050";
                return (
                  <div key={i} style={{ marginBottom: "14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                      <span style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "0.75rem", color: "#666" }}>{dti.label}</span>
                      <span style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "0.85rem", color, fontWeight: 600 }}>{dti.value.toFixed(1)}%</span>
                    </div>
                    <div className="dti-bar-bg">
                      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: "4px", transition: "width 0.8s ease" }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: "3px" }}>
                      <span style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "0.65rem", color: "#3a3a3a" }}>0%</span>
                      <span style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "0.65rem", color: "#3a3a3a" }}>Max {dti.good}%</span>
                    </div>
                  </div>
                );
              })}

              <div style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "0.72rem", color: "#3a3a3a", marginTop: "12px" }}>
                Rate used: {RATE}% · 30yr fixed · Lubbock tax rate ~1.85%
              </div>
            </div>

            {/* AI analysis */}
            <div className="card" style={{ padding: "24px", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
                <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#c8a96e" }} />
                <h2 style={{ fontFamily: "'Playfair Display', serif", color: "#f0ebe0", fontSize: "1.1rem", margin: 0, fontWeight: 700 }}>
                  Honest Assessment
                </h2>
              </div>

              {loading ? (
                <div style={{ textAlign: "center", padding: "24px 0" }}>
                  <div className="pulse" style={{ fontFamily: "'Source Sans 3', sans-serif", color: "#555", fontSize: "0.85rem" }}>
                    Analyzing your numbers...
                  </div>
                </div>
              ) : (
                <div className="ai-text">
                  {aiResponse.split("\n").filter(Boolean).map((p, i) => (
                    <p key={i} style={{ margin: "0 0 14px" }}>{p}</p>
                  ))}
                </div>
              )}
            </div>

            {/* CTA */}
            <div className="card" style={{ padding: "20px 24px", borderColor: "#c8a96e33", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
              <div>
                <div style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "0.75rem", color: "#c8a96e", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "2px" }}>Ready to talk real numbers?</div>
                <div style={{ fontFamily: "'Playfair Display', serif", color: "#f0ebe0", fontSize: "1rem" }}>Justin Lowrey · The Lowrey Group</div>
                <div style={{ fontFamily: "'Source Sans 3', sans-serif", color: "#555", fontSize: "0.8rem" }}>thelowreygroup.com</div>
              </div>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <button className="btn-ghost" onClick={handleReset} style={{ fontSize: "0.8rem", padding: "10px 18px" }}>Start Over</button>
                <button className="btn-primary" style={{ fontSize: "0.8rem", padding: "10px 20px" }} onClick={() => window.open("https://thelowreygroup.com", "_blank")}>
                  Get In Touch
                </button>
              </div>
            </div>

            <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "0.7rem", color: "#2e2e2e", textAlign: "center", marginTop: "16px", lineHeight: 1.6 }}>
              For educational purposes only. Estimates based on current market rates and are not a guarantee of loan qualification. Consult a licensed lender.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
// updated Wed Jun  3 12:15:42 CDT 2026
