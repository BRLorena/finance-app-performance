import { describe, expect, it } from "vitest";
import { parseRequests, slowestReport } from "./requests.ts";

const csv = `metric_name,timestamp,metric_value,check,error,error_code,expected_response,group,method,name,proto,scenario,service,status,subproto,tls_version,url,extra_tags,metadata
http_req_duration,1000,6.0,,,,true,,POST,expense_create,HTTP/1.1,journey,,201,,,u,,vu=1&iter=0
http_req_waiting,1000,5.0,,,,true,,POST,expense_create,HTTP/1.1,journey,,201,,,u,,vu=1&iter=0
http_req_duration,1500,92.0,,,,true,,POST,expense_create,HTTP/1.1,journey,,201,,,u,,iter=0&vu=2
http_req_duration,9000,7.0,,,,true,,POST,expense_create,HTTP/1.1,journey,,201,,,u,,vu=1&iter=3
http_req_duration,9100,500.0,,"request timeout, retrying",1050,false,,GET,summary,HTTP/1.1,journey,,429,,,u,,vu=3&iter=4
http_req_duration,900,40.0,,,,true,,POST,warmup,HTTP/1.1,setup,,201,,,u,,vu=0&iter=0`;

describe("parseRequests", () => {
  it("keeps one row per request, timed from the first one", () => {
    const requests = parseRequests(csv);
    expect(requests).toHaveLength(5);
    expect(requests[1]).toEqual({
      name: "expense_create",
      at: 600,
      duration: 92,
      status: "201",
      vu: 2,
      iter: 0,
    });
  });
});

describe("slowestReport", () => {
  const report = slowestReport(parseRequests(csv), 2);

  it("lists each endpoint's slowest requests with when and who made them", () => {
    expect(report).toContain(
      "| expense_create | 3 | 7 ms | 92 ms | 92 ms at 0.6s (VU 2, iter 0)<br>7 ms at 8.1s (VU 1, iter 3) |",
    );
  });

  it("shows only unexpected statuses", () => {
    expect(report).toContain("500 ms at 8.2s (VU 3, iter 4, 429)");
  });

  it("leaves the setup warm-up out", () => {
    expect(report).not.toContain("warmup");
  });
});
