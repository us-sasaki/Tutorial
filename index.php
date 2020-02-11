<?php
$access_token = 'zTfpLCTtUWVAGnp95INDx3de8T/EG2ukew+jtWj1HvXhmGOj7oPXF0GdRbbnpg7ZKLUjh9arYNyLyB8PVr9lSw+Jlil74QiYmYXEhYIKNcTf28Ea96OJszU+6Q7WM/xjATUOfmJmcDrFKqztgJz3NgdB04t89/1O/w1cDnyilFU=';

$post_data['messages'][] = array(
  'type' => 'text',
  'text' => '‚Ä‚·‚Æ‚ß‚Á‚¹[‚¶'
);

$ch = curl_init('https://api.line.me/v2/bot/message/broadcast');
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'POST');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($post_data));
curl_setopt($ch, CURLOPT_HTTPHEADER, array(
  'Content-Type: application/json; charser=UTF-8',
  'Authorization: Bearer ' . $access_token
));

$result = curl_exec($ch);
curl_close($ch);
?>
