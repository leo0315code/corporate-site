<?php
// QA temporary: verify Service::normalize truncates BEFORE Validate runs
require __DIR__ . '/vendor/autoload.php';

use app\validate\MessageValidate;

function norm(array $p): array
{
    return [
        'name'    => mb_substr(trim((string) ($p['name'] ?? '')), 0, 30),
        'company' => mb_substr(trim((string) ($p['company'] ?? '')), 0, 50),
        'phone'   => trim((string) ($p['phone'] ?? '')),
        'email'   => trim((string) ($p['email'] ?? '')),
        'content' => mb_substr(trim((string) ($p['content'] ?? '')), 0, 500),
    ];
}

$cases = [
    'name 31 chars'    => ['name' => str_repeat('张', 31), 'company' => '', 'phone' => '13800000000', 'email' => '', 'content' => '测试内容测试内容', 'field' => 'name'],
    'company 51 chars' => ['name' => '王先生', 'company' => str_repeat('公', 51), 'phone' => '13800000000', 'email' => '', 'content' => '测试内容测试内容', 'field' => 'company'],
    'content 501 chars' => ['name' => '王先生', 'company' => '', 'phone' => '13800000000', 'email' => '', 'content' => str_repeat('测', 501), 'field' => 'content'],
];

foreach ($cases as $label => $raw) {
    $field = $raw['field'];
    unset($raw['field']);
    $rawLen = mb_strlen($raw[$field]);
    $d = norm($raw);
    $v = new MessageValidate();
    $ok = $v->scene('submit')->check($d);
    printf("%-18s raw=%d chars -> after normalize=%d chars => %s\n",
        $label, $rawLen, mb_strlen($d[$field]), $ok ? 'PASS (silently accepted, data truncated)' : 'FAIL: ' . $v->getError());
}
