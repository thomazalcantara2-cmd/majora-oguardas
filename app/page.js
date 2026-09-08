'use client';

import { useState } from 'react';

const STEPS = ['search', 'password', 'data', 'success'];
const STEP_LABELS = { search: 'CPF', password: 'Senha', data: 'Resposta', success: 'Concluído' };
const TAMANHO_MAXIMO_TEXTO = 8000;

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

  const [recursoTexto, setRecursoTexto] = useState('');
  const [editandoRecurso, setEditandoRecurso] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [successInfo, setSuccessInfo] = useState(null);

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
      setRecursoTexto('');
      setEditandoRecurso(!json.dados.recursoJaEnviado);
      setSubmitError('');
      irParaEtapa('data');
    } catch (err) {
      setPasswordError('Erro ao validar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  async function enviarRecurso() {
    setSubmitError('');
    const texto = recursoTexto.trim();
    if (!texto) {
      setSubmitError('Escreva o texto do recurso antes de enviar.');
      return;
    }
    if (texto.length > TAMANHO_MAXIMO_TEXTO) {
      setSubmitError(`O texto excede o tamanho máximo permitido (${TAMANHO_MAXIMO_TEXTO} caracteres).`);
      return;
    }
    if (!token) {
      setSubmitError('Sessão expirada. Refaça a identificação por CPF e a validação de senha.');
      return;
    }

    setLoading(true);
    try {
      const resp = await fetch('/api/recurso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, texto })
      });
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
        <div className="org-row">
          <div className="org-text">
            <p className="org-line1">Prefeitura Municipal do Jaboatão dos Guararapes</p>
            <p className="org-line2">
              Secretaria Municipal de Administração, Governo Digital e Inovação — Secretaria Executiva de Gestão de
              Pessoas
            </p>
          </div>
          <img src="/logo-pmjg.png" alt="Jaboatão dos Guararapes" className="org-logo" />
        </div>
        <div className="hero">
          <div className="stripe-meta">
            <span className="stripe stripe-amarela" />
            <span className="stripe stripe-verde" />
            <span className="stripe-label">Guarda Municipal · Majoração de jornada</span>
          </div>
          <h1>Resposta à manifestação e recurso</h1>
          <p className="subtitle">
            Consulte a resposta à sua manifestação sobre a classificação prévia da majoração de jornada e, se quiser,
            apresente recurso.
          </p>
        </div>
      </header>

      <div className="textura-faixa" aria-hidden="true" />

      <div className="content-col">
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
            <h2>Sua manifestação</h2>
            <p className="lede">Confira abaixo a decisão sobre a sua manifestação e baixe a resposta completa.</p>

            <span className={`pill ${dados.status === 'Deferido' ? 'pill-confirmed' : 'pill-denied'}`}>
              {dados.status}
            </span>

            <label htmlFor="f-matricula">Matrícula</label>
            <input id="f-matricula" type="text" className="mono" value={dados.matricula} disabled readOnly />

            <label htmlFor="f-nome">Nome</label>
            <input id="f-nome" type="text" value={dados.nome} disabled readOnly />

            <label htmlFor="f-classe">Classe</label>
            <input id="f-classe" type="text" value={dados.classe} disabled readOnly />

            <a
              href={dados.respostaUrl}
              target="_blank"
              rel="noreferrer"
              className="btn btn-primary"
              style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}
            >
              Baixar minha resposta (PDF)
            </a>

            <hr className="sep" />

            <h2 style={{ marginBottom: 2 }}>Recurso</h2>
            <p className="lede">
              Se quiser contestar a decisão acima, escreva seu recurso abaixo. O texto é transformado em PDF e
              enviado à SEGEP para análise.
            </p>

            {dados.recursoJaEnviado && !editandoRecurso ? (
              <>
                <p className="msg msg-warn">Recurso já apresentado em {dados.dataRecurso}.</p>
                {dados.recursoPdfUrl && (
                  <a href={dados.recursoPdfUrl} target="_blank" rel="noreferrer" className="btn btn-primary">
                    Baixar meu recurso (PDF)
                  </a>
                )}
                <button type="button" className="btn-ghost" style={{ marginTop: 16 }} onClick={() => setEditandoRecurso(true)}>
                  Enviar um novo recurso (substitui o anterior)
                </button>
              </>
            ) : (
              <>
                <label htmlFor="f-recurso-texto">Texto do recurso</label>
                <textarea
                  id="f-recurso-texto"
                  maxLength={TAMANHO_MAXIMO_TEXTO}
                  placeholder="Escreva aqui o seu recurso..."
                  value={recursoTexto}
                  onChange={(e) => setRecursoTexto(e.target.value)}
                />
                <button type="button" className="btn btn-primary" onClick={enviarRecurso} disabled={loading}>
                  Enviar recurso
                </button>
                {submitError && <p className="msg msg-error">{submitError}</p>}
              </>
            )}
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
              <h2>Recurso enviado!</h2>
              <p>Seu recurso foi registrado com sucesso. Registrado em {successInfo.timestamp}.</p>
              {successInfo.recursoPdfUrl && (
                <a href={successInfo.recursoPdfUrl} target="_blank" rel="noreferrer" className="btn btn-primary">
                  Baixar meu recurso (PDF)
                </a>
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
    </div>
  );
}
