"""Teste de carga do endpoint de transferência da Wallet API (Locust).

Simula usuários simultâneos enviando transferências entre um conjunto de contas
e, ao final, verifica três critérios:

  1. taxa de erro abaixo do limite (RNF06);
  2. latência média abaixo do limite (RNF06);
  3. conciliação: a soma dos saldos das contas é igual à soma inicial, ou seja,
     nenhuma transferência concorrente criou ou destruiu dinheiro (RF08).

Execução (com a API no ar em http://localhost:3000):

    locust -f load/locustfile.py --headless --users 50 --spawn-rate 50 \
           --run-time 30s --host http://localhost:3000 \
           --csv load/results/carga --only-summary

O resumo é gravado em load/results/resumo.json e load/results/resumo.md.
"""

import json
import os
import random
import uuid
from pathlib import Path

import requests
from locust import HttpUser, constant, events, task

ACCOUNT_COUNT = int(os.getenv("LOAD_ACCOUNT_COUNT", "20"))
INITIAL_BALANCE = 100_000_000  # R$ 1.000.000,00 em centavos, para não faltar saldo
MAX_ERROR_RATE = float(os.getenv("LOAD_MAX_ERROR_RATE", "0.01"))
MAX_AVG_LATENCY_MS = float(os.getenv("LOAD_MAX_AVG_LATENCY_MS", "500"))
RESULTS_DIR = Path(__file__).parent / "results"

account_ids = []


def generate_cpf():
    """Gera um CPF fictício com dígitos verificadores válidos."""
    digits = [random.randint(0, 9) for _ in range(9)]
    for _ in range(2):
        first_weight = len(digits) + 1
        total = sum(digit * (first_weight - index) for index, digit in enumerate(digits))
        remainder = (total * 10) % 11
        digits.append(0 if remainder == 10 else remainder)
    return "".join(str(digit) for digit in digits)


def create_account(host, index):
    """Cria uma conta de teste; tenta outro CPF se o sorteado já existir (409)."""
    for _ in range(5):
        response = requests.post(
            f"{host}/accounts",
            json={
                "ownerName": f"Titular de Carga {index + 1}",
                "document": generate_cpf(),
                "initialBalance": INITIAL_BALANCE,
            },
            timeout=10,
        )
        if response.status_code == 201:
            return response.json()["id"]
        if response.status_code not in (400, 409):
            response.raise_for_status()
    raise RuntimeError("Não foi possível criar a conta de teste")


@events.test_start.add_listener
def prepare_accounts(environment, **_kwargs):
    account_ids.clear()
    for index in range(ACCOUNT_COUNT):
        account_ids.append(create_account(environment.host, index))
    print(f"{len(account_ids)} contas criadas para o teste de carga")


class TransferUser(HttpUser):
    # Sem tempo de espera: cada usuário mantém sempre uma requisição em andamento,
    # portanto N usuários equivalem a N requisições simultâneas.
    wait_time = constant(0)

    def new_transfer(self):
        source, target = random.sample(account_ids, 2)
        body = {
            "sourceAccountId": source,
            "targetAccountId": target,
            "amount": random.randint(1, 1000),
        }
        return body, {"Idempotency-Key": str(uuid.uuid4())}

    @task(9)
    def transfer(self):
        body, headers = self.new_transfer()
        with self.client.post(
            "/transfers", json=body, headers=headers, name="POST /transfers", catch_response=True
        ) as response:
            if response.status_code != 201:
                response.failure(f"status inesperado: {response.status_code}")

    @task(1)
    def transfer_with_retry(self):
        """Envia a mesma transferência duas vezes: a segunda deve ser uma repetição idempotente."""
        body, headers = self.new_transfer()
        first = self.client.post("/transfers", json=body, headers=headers, name="POST /transfers")
        with self.client.post(
            "/transfers",
            json=body,
            headers=headers,
            name="POST /transfers (repetição idempotente)",
            catch_response=True,
        ) as second:
            if first.status_code != 201 or second.status_code != 200:
                second.failure(f"status inesperado: {first.status_code} e {second.status_code}")
            elif first.json()["id"] != second.json()["id"]:
                second.failure("a repetição gerou uma transferência diferente")


def total_balance(host):
    total = 0
    for account_id in account_ids:
        response = requests.get(f"{host}/accounts/{account_id}", timeout=10)
        response.raise_for_status()
        total += response.json()["balance"]
    return total


@events.test_stop.add_listener
def write_summary(environment, **_kwargs):
    stats = environment.stats.total
    expected_balance = ACCOUNT_COUNT * INITIAL_BALANCE
    final_balance = total_balance(environment.host)

    summary = {
        "usuarios_simultaneos": environment.runner.target_user_count,
        "requisicoes": stats.num_requests,
        "falhas": stats.num_failures,
        "taxa_de_erro_percentual": round(stats.fail_ratio * 100, 3),
        "requisicoes_por_segundo": round(stats.total_rps, 1),
        "latencia_media_ms": round(stats.avg_response_time, 2),
        "latencia_mediana_ms": stats.median_response_time,
        "latencia_p95_ms": stats.get_response_time_percentile(0.95),
        "latencia_p99_ms": stats.get_response_time_percentile(0.99),
        "latencia_maxima_ms": round(stats.max_response_time, 2),
        "soma_dos_saldos_esperada": expected_balance,
        "soma_dos_saldos_final": final_balance,
        "conciliacao_ok": final_balance == expected_balance,
    }

    checks = {
        f"Taxa de erro abaixo de {MAX_ERROR_RATE * 100:g}%": stats.fail_ratio < MAX_ERROR_RATE,
        f"Latência média abaixo de {MAX_AVG_LATENCY_MS:g} ms": stats.avg_response_time < MAX_AVG_LATENCY_MS,
        "Soma dos saldos preservada (conciliação)": summary["conciliacao_ok"],
        "Pelo menos uma requisição executada": stats.num_requests > 0,
    }
    summary["criterios"] = checks

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    (RESULTS_DIR / "resumo.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")

    lines = [
        "## Teste de carga: POST /transfers",
        "",
        "| Métrica | Valor |",
        "|---|---|",
        f"| Usuários simultâneos | {summary['usuarios_simultaneos']} |",
        f"| Requisições | {summary['requisicoes']} |",
        f"| Falhas | {summary['falhas']} |",
        f"| Taxa de erro | {summary['taxa_de_erro_percentual']}% |",
        f"| Vazão | {summary['requisicoes_por_segundo']} req/s |",
        f"| Latência média | {summary['latencia_media_ms']} ms |",
        f"| Latência mediana | {summary['latencia_mediana_ms']} ms |",
        f"| Latência p95 | {summary['latencia_p95_ms']} ms |",
        f"| Latência p99 | {summary['latencia_p99_ms']} ms |",
        f"| Latência máxima | {summary['latencia_maxima_ms']} ms |",
        "",
        "| Critério | Resultado |",
        "|---|---|",
    ]
    lines += [f"| {name} | {'atendido' if passed else 'NÃO atendido'} |" for name, passed in checks.items()]
    report = "\n".join(lines) + "\n"
    (RESULTS_DIR / "resumo.md").write_text(report, encoding="utf-8")
    print("\n" + report)

    if not all(checks.values()):
        environment.process_exit_code = 1
