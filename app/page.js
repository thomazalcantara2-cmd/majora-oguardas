'use client';

import { useState, useRef } from 'react';

const MAX_ANEXO_BYTES = 10 * 1024 * 1024;
const MIME_PERMITIDOS = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];

const STEPS = ['search', 'password', 'data', 'success'];
const STEP_LABELS = { search: 'CPF', password: 'Senha', data: 'Dados', success: 'Concluído' };

export default function Page() {
  const [step, setStep] = useState('search');
  const [loading, setLoading] = useState(false);

  const [cpf, setCpf] = useState('');
  const [searchError, setSearchError] = useState('');

  const [selectedId, setSelectedId] = useState(null);
  const [selectedName, setSelectedName] = useState('');
  const [senha, setSenha] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const [token, setToken] = useState(null);
  const [dados, setDados] = useState(null);

  const [requerimentoTexto, setRequerimentoTexto] = useState('');
  const [anexoError, setAnexoError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [successInfo, setSuccessInfo] = useState(null);

  const anexoInputRef = useRef(null);

  function irParaEtapa(novaEtapa) {
    setStep(novaEtapa);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function buscarPorCpf() {
    const cpfDigitos = cpf.replace(/\D/g, '');
    if (cpfDigitos.length !== 11) {
      setSearchError('Digite os 11 números do CPF.');
      return;
    }
    setSearchError('');
    setLoading(true);
    try {
      const resp = await fetch('/api/buscar-cpf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cpf: cpfDigitos })
      });
      const json = await resp.json();
      if (!json.ok) {
        setSearchError(json.message);
        return;
      }
      setSelectedId(json.id);
      setSelectedName(json.nome);
      setSenha('');
      setPasswordError('');
      irParaEtapa('password');
    } catch (err) {
      setSearchError('Erro ao consultar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  async function validarSenha() {
    if (senha.length !== 4) {
      setPasswordError('Digite os 4 dígitos da senha.');
      return;
    }
    setPasswordError('');
    setLoading(true);
    try {
      const resp = await fetch('/api/validar-senha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedId, senha })
      });
      const json = await resp.json();
      if (!json.ok) {
        setPasswordError(json.message);
        setSenha('');
        return;
      }
      setToken(json.token);
      setDados(json.dados);
      setRequerimentoTexto('');
      if (anexoInputRef.current) anexoInputRef.current.value = '';
      setSubmitError('');
      setAnexoError('');
      irParaEtapa('data');
    } catch (err) {
      setPasswordError('Erro ao validar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  function onAnexoChange(e) {
    setAnexoError('');
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (MIME_PERMITIDOS.indexOf(file.type) === -1) {
      setAnexoError('Tipo de arquivo não permitido. Envie PDF, JPG, PNG ou DOCX.');
      e.target.value = '';
      return;
    }
    if (file.size > MAX_ANEXO_BYTES) {
      setAnexoError('Arquivo excede o tamanho máximo permitido (10MB).');
      e.target.value = '';
    }
  }

  async function enviar() {
    setSubmitError('');
    if (!token) {
      setSubmitError('Sessão expirada. Refaça a identificação por CPF e a validação de senha.');
      return;
    }

    const file = anexoInputRef.current && anexoInputRef.current.files[0];
    if (file && (MIME_PERMITIDOS.indexOf(file.type) === -1 || file.size > MAX_ANEXO_BYTES)) {
      setSubmitError('Verifique o arquivo anexado antes de continuar.');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.set('token', token);
      formData.set('requerimentoTexto', requerimentoTexto);
      if (file) formData.set('anexo', file);

      const resp = await fetch('/api/confirmar', { method: 'POST', body: formData });
      const json = await resp.json();
      if (!json.ok) {
        setSubmitError(json.message || 'Não foi possível registrar. Tente novamente.');
        return;
      }
      setSuccessInfo(json);
      irParaEtapa('success');
    } catch (err) {
      setSubmitError('Erro ao registrar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  const stepIndex = STEPS.indexOf(step);

  return (
    <div className="shell">
      <header>
        <p className="eyebrow">SEGEP · Guarda Municipal de Jaboatão dos Guararapes</p>
        <h1>Confirmação de dados — Majoração de jornada 40h</h1>
        <p className="subtitle">
          Confira os dados do seu requerimento de majoração de jornada semanal de 30h para 40h.
        </p>
      </header>

      <div className="stepper">
        {STEPS.map((s, i) => (
          <div key={s} className={`tick ${i < stepIndex ? 'done' : ''} ${i === stepIndex ? 'current' : ''}`} />
        ))}
      </div>
      <div className="step-labels">
        {STEPS.map((s, i) => (
          <span key={s} className={i <= stepIndex ? 'active' : ''}>
            {STEP_LABELS[s]}
          </span>
        ))}
      </div>

      <main style={{ position: 'relative' }}>
        {step === 'search' && (
          <section className="card">
            <h2>Digite seu CPF</h2>
            <p className="lede">
              Usamos o CPF completo só para localizar o seu registro — em seguida você confirma a identidade com a
              senha.
            </p>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="000.000.000-00"
              maxLength={14}
              value={cpf}
              onChange={(e) => setCpf(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && buscarPorCpf()}
            />
            <button type="button" className="btn btn-primary" onClick={buscarPorCpf} disabled={loading}>
              Continuar
            </button>
            {!searchError && <p className="hint">Digite os 11 números do CPF (com ou sem pontuação).</p>}
            {searchError && <p className="msg msg-error">{searchError}</p>}
          </section>
        )}

        {step === 'password' && (
          <section className="card">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setSelectedId(null);
                setSenha('');
                setPasswordError('');
                irParaEtapa('search');
              }}
            >
              &larr; Voltar
            </button>
            <h2>Confirme sua identidade</h2>
            <p className="lede">
              Encontramos: <strong>{selectedName}</strong>. É você?
            </p>
            <label htmlFor="password-input">Senha — últimos 4 dígitos do seu CPF</label>
            <input
              id="password-input"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              autoComplete="off"
              placeholder="••••"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && validarSenha()}
            />
            <p className="field-hint">
              Como você já digitou o CPF completo, esta etapa serve para confirmar que não houve engano na
              digitação.
            </p>
            <button type="button" className="btn btn-primary" onClick={validarSenha} disabled={loading}>
              Confirmar identidade
            </button>
            {passwordError && <p className="msg msg-error">{passwordError}</p>}
          </section>
        )}

        {step === 'data' && dados && (
          <section className="card">
            <h2>Seus dados</h2>
            <p className="lede">Confira os dados abaixo.</p>

            <span className={`pill ${dados.status === 'Confirmado' ? 'pill-confirmed' : 'pill-pending'}`}>
              {dados.status}
            </span>

            <label htmlFor="f-matricula">Matrícula</label>
            <input id="f-matricula" type="text" className="mono" value={dados.matricula} disabled readOnly />

            <label htmlFor="f-nome">Nome</label>
            <input id="f-nome" type="text" value={dados.nome} disabled readOnly />

            <label htmlFor="f-cpf">CPF</label>
            <input id="f-cpf" type="text" className="mono" value={dados.cpfMascarado} disabled readOnly />

            <label htmlFor="f-ordem">Ordem</label>
            <input id="f-ordem" type="text" className="mono" value={dados.ordem} disabled readOnly />

            <label htmlFor="f-data-requerimento">Data/hora do requerimento</label>
            <input
              id="f-data-requerimento"
              type="text"
              className="mono"
              value={dados.dataRequerimento}
              disabled
              readOnly
            />

            <hr className="sep" />

            <h2 style={{ marginBottom: 2 }}>Requerimento</h2>
            <p className="lede">Espaço livre para justificativa, observação ou pedido relacionado à majoração.</p>

            <label htmlFor="f-requerimento-texto">Texto do requerimento</label>
            <textarea
              id="f-requerimento-texto"
              maxLength={4000}
              placeholder="Escreva aqui, se necessário..."
              value={requerimentoTexto}
              onChange={(e) => setRequerimentoTexto(e.target.value)}
            />

            <label htmlFor="f-anexo">Anexo (opcional) — PDF, JPG, PNG ou DOCX, até 10MB</label>
            <input
              id="f-anexo"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.docx"
              ref={anexoInputRef}
              onChange={onAnexoChange}
            />
            {anexoError && <p className="msg msg-error">{anexoError}</p>}

            <button type="button" className="btn btn-primary" onClick={enviar} disabled={loading}>
              Confirmar dados corretos
            </button>
            {submitError && <p className="msg msg-error">{submitError}</p>}
          </section>
        )}

        {step === 'success' && successInfo && (
          <section className="card">
            <div className="success-box">
              <div className="stamp-wrap">
                <div className="stamp">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="4 12.5 9.5 18 20 6"></polyline>
                  </svg>
                </div>
              </div>
              <h2>Dados confirmados!</h2>
              <p>Seus dados foram confirmados com sucesso. Registrado em {successInfo.timestamp}.</p>
              {successInfo.requerimentoRecebido && (
                <p style={{ color: 'var(--ink-soft)', fontSize: '0.88rem' }}>
                  Seu requerimento (texto e/ou anexo) também foi recebido e está pendente de análise.
                </p>
              )}
            </div>
          </section>
        )}

        {loading && (
          <div className="loading-overlay">
            <div className="spinner" />
          </div>
        )}
      </main>

      <footer className="app-footer">
        <p>SEGEP — Secretaria Executiva de Gestão de Pessoas</p>
      </footer>
    </div>
  );
}
