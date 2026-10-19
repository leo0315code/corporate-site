#!/usr/bin/env bash
# Round 2 full regression sweep — 21 cases
B=http://127.0.0.1:8000
PASS=0; FAIL=0
N31=$(printf '张%.0s' {1..31}); N30=$(printf '张%.0s' {1..30})
C51=$(printf '公%.0s' {1..51}); C50=$(printf '公%.0s' {1..50})
CN501=$(printf '测%.0s' {1..501}); CN500=$(printf '测%.0s' {1..500})
CNT() { /e/ServBay/bin/mysql.cmd -uroot -proot -N -e "SELECT COUNT(*) FROM corporate_site.message;" 2>/dev/null; }

expect() { # label expected_code actual_json
  local code=$(echo "$3" | grep -o '"code":[0-9]*' | head -1 | cut -d: -f2)
  if [ "$code" = "$2" ]; then echo "PASS  $1  (code=$code)"; PASS=$((PASS+1));
  else echo "FAIL  $1  (expected $2, got $code)  raw=$3"; FAIL=$((FAIL+1)); fi
}

post() { curl -s -X POST $B/api/message -H "Content-Type: application/json" -d "$1"; }

expect "T1 正常(手机)"            0    "$(post '{"name":"张先生","company":"","phone":"13800000000","email":"","content":"想了解产品报价和服务方案"}')"
expect "T2 正常(仅邮箱+公司)"      0    "$(post '{"name":"李女士","company":"示例集团","phone":"","email":"li@example.com","content":"需要一份数字化转型方案"}')"
expect "T3 name必填缺失"           1001 "$(post '{"name":"","phone":"13800000000","email":"","content":"测试内容测试内容"}')"
expect "T4 name长度不足"           1001 "$(post '{"name":"张","phone":"13800000000","email":"","content":"测试内容测试内容"}')"
expect "T5 电话+邮箱都为空"         1001 "$(post '{"name":"王先生","phone":"","email":"","content":"测试内容测试内容"}')"
expect "T6 非法手机号12345"         1001 "$(post '{"name":"王先生","phone":"12345","email":"","content":"测试内容测试内容"}')"
expect "T7 合法座机010-12345678"    0    "$(post '{"name":"赵先生","phone":"010-12345678","email":"","content":"座机测试内容测试"}')"
expect "T8 内容过短"               1001 "$(post '{"name":"王先生","phone":"13800000000","email":"","content":"hi"}')"
expect "T9 非法邮箱"               1001 "$(post '{"name":"王先生","phone":"","email":"not-an-email","content":"测试内容测试内容"}')"

# T10 幂等：3连发
cb=$(CNT); post '{"name":"幂等X","phone":"13900000077","email":"","content":"幂等专项第二轮测试内容"}' >/dev/null
post '{"name":"幂等X","phone":"13900000077","email":"","content":"幂等专项第二轮测试内容"}' >/dev/null
post '{"name":"幂等X","phone":"13900000077","email":"","content":"幂等专项第二轮测试内容"}' >/dev/null
ca=$(CNT); if [ $((ca-cb)) -eq 1 ]; then echo "PASS  T10 幂等3连发仅入库1行 (Δ=$((ca-cb)))"; PASS=$((PASS+1)); else echo "FAIL  T10 幂等 (Δ=$((ca-cb)), 预期1)"; FAIL=$((FAIL+1)); fi

expect "T11 非法手机号变体"         1001 "$(post '{"name":"王先生","phone":"12800000000","email":"","content":"测试内容测试内容"}')"
expect "T12 company51字"           1001 "$(post "{\"name\":\"王先生\",\"company\":\"$C51\",\"phone\":\"13800000000\",\"email\":\"\",\"content\":\"测试内容测试内容\"}")"
expect "T13 content501字"          1001 "$(post "{\"name\":\"王先生\",\"phone\":\"13800000000\",\"email\":\"\",\"content\":\"$CN501\"}")"
r=$(curl -s "$B/api/message/list?page=1&size=3"); expect "T14 分页列表" 0 "$r"
expect "T15 未知路由"              4004 "$(curl -s $B/api/nonexistent)"
oc=$(curl -s -o /dev/null -w "%{http_code}" -X OPTIONS $B/api/message -H "Origin: http://localhost:5173"); if [ "$oc" = "204" ]; then echo "PASS  T16 OPTIONS预检 (204)"; PASS=$((PASS+1)); else echo "FAIL  T16 ($oc)"; FAIL=$((FAIL+1)); fi
expect "T17 省略company"           0    "$(post '{"name":"省略公司","phone":"13711112222","email":"","content":"公司字段省略测试内容"}')"
expect "T18 name31字"              1001 "$(post "{\"name\":\"$N31\",\"phone\":\"13711112223\",\"email\":\"\",\"content\":\"姓名超长测试内容\"}")"
expect "T19 空body"                1001 "$(post '{}')"
expect "T20 表单格式提交"           0    "$(curl -s -X POST $B/api/message -H 'Content-Type: application/x-www-form-urlencoded' --data-urlencode 'name=表单用户' --data-urlencode 'phone=13655556666' --data-urlencode 'email=' --data-urlencode 'content=表单格式提交测试')"
expect "T21 content缺失"           1001 "$(post '{"name":"王先生","phone":"13800000000","email":""}')"

# 边界值（附加）
expect "B1 name=30边界"            0    "$(post "{\"name\":\"$N30\",\"phone\":\"13933330001\",\"email\":\"\",\"content\":\"边界姓名测试内容\"}")"
expect "B2 company=50边界"         0    "$(post "{\"name\":\"边界\",\"company\":\"$C50\",\"phone\":\"13933330002\",\"email\":\"\",\"content\":\"边界公司测试内容\"}")"
expect "B3 content=500边界"        0    "$(post "{\"name\":\"边界\",\"phone\":\"13933330003\",\"email\":\"\",\"content\":\"$CN500\"}")"

echo ""
echo "======================================"
echo "ROUND2 RESULTS: PASS=$PASS FAIL=$FAIL"
echo "======================================"
