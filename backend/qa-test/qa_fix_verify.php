<?php
// QA temporary: verify the proposed fix (adding phone/email to $must) resolves T5
require __DIR__ . '/../vendor/autoload.php';

use app\validate\MessageValidate;

// Subclass simulating the proposed fix
class FixedValidate extends MessageValidate
{
    protected $must = ['phone', 'email'];
}

function run(string $label, $validator, array $data)
{
    $v = new $validator();
    $ok = $v->scene('submit')->check($data);
    echo str_pad($label, 46) . ' => ' . ($ok ? 'PASS' : 'FAIL: ' . $v->getError()) . "\n";
}

$bothEmpty = ['name' => '王先生', 'company' => '', 'phone' => '', 'email' => '', 'content' => '测试内容测试内容'];

echo "--- BEFORE fix (MessageValidate) ---\n";
run('both phone & email empty (expect FAIL)', MessageValidate::class, $bothEmpty);
echo "\n--- AFTER fix (FixedValidate with \$must) ---\n";
run('both phone & email empty (expect FAIL)', FixedValidate::class, $bothEmpty);
run('phone ok / email empty (expect PASS)', FixedValidate::class, ['name' => '王先生', 'company' => '', 'phone' => '13800000000', 'email' => '', 'content' => '测试内容测试内容']);
run('email ok / phone empty (expect PASS)', FixedValidate::class, ['name' => '王先生', 'company' => '', 'phone' => '', 'email' => 'a@b.com', 'content' => '测试内容测试内容']);
