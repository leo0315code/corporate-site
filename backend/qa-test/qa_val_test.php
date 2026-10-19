<?php
// QA temporary isolated validator test (not part of app code)
require __DIR__ . '/vendor/autoload.php';

use app\validate\MessageValidate;

function t($label, $data)
{
    $v = new MessageValidate();
    $ok = $v->scene('submit')->check($data);
    echo str_pad($label, 40) . ' => ' . ($ok ? 'PASS' : 'FAIL: ' . $v->getError()) . "\n";
}

t('both phone & email empty (expect FAIL)', ['name' => '王先生', 'company' => '', 'phone' => '', 'email' => '', 'content' => '测试内容测试内容']);
t('phone ok, email empty (expect PASS)', ['name' => '王先生', 'company' => '', 'phone' => '13800000000', 'email' => '', 'content' => '测试内容测试内容']);
t('email ok, phone empty (expect PASS)', ['name' => '王先生', 'company' => '', 'phone' => '', 'email' => 'a@b.com', 'content' => '测试内容测试内容']);
t('content empty + phone ok (expect FAIL)', ['name' => '王先生', 'company' => '', 'phone' => '13800000000', 'email' => '', 'content' => '']);
t('name 2 + content 5 boundary (expect PASS)', ['name' => '张三', 'company' => '', 'phone' => '13800000000', 'email' => '', 'content' => '12345']);
t('company 51 chars (expect FAIL)', ['name' => '王先生', 'company' => str_repeat('公', 51), 'phone' => '13800000000', 'email' => '', 'content' => '测试内容测试内容']);
t('content 501 chars (expect FAIL)', ['name' => '王先生', 'company' => '', 'phone' => '13800000000', 'email' => '', 'content' => str_repeat('测', 501)]);
t('name 31 chars (expect FAIL)', ['name' => str_repeat('张', 31), 'company' => '', 'phone' => '13800000000', 'email' => '', 'content' => '测试内容测试内容']);
t('name 30 chars (expect PASS)', ['name' => str_repeat('张', 30), 'company' => '', 'phone' => '13800000000', 'email' => '', 'content' => '测试内容测试内容']);
t('content 500 chars (expect PASS)', ['name' => '王先生', 'company' => '', 'phone' => '13800000000', 'email' => '', 'content' => str_repeat('测', 500)]);
t('invalid tel 12345 (expect FAIL)', ['name' => '王先生', 'company' => '', 'phone' => '12345', 'email' => '', 'content' => '测试内容测试内容']);
t('valid tel 010-12345678 (expect PASS)', ['name' => '王先生', 'company' => '', 'phone' => '010-12345678', 'email' => '', 'content' => '测试内容测试内容']);
