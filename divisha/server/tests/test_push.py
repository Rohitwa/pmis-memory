import tempfile
import unittest

from cryptography.hazmat.primitives.asymmetric import ec

from server.push import Pusher, b64u, encrypt, unb64u


class PushTest(unittest.TestCase):
    def test_encryption_matches_rfc_8291_example(self):
        # RFC 8291, Appendix A: the exact keys, salt and expected message.
        as_private = ec.derive_private_key(int.from_bytes(unb64u("yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw"), "big"), ec.SECP256R1())
        body = encrypt(
            b"When I grow up, I want to be a watermelon",
            unb64u("BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4"),
            unb64u("BTBZMqHH6r4Tts7J_aSIgg"),
            as_private=as_private,
            salt=unb64u("DGv6ra1nlYgDCS1FRnbzlw"),
        )
        self.assertEqual(b64u(body), "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN")

    def test_the_server_key_is_made_once_and_kept(self):
        with tempfile.TemporaryDirectory() as d:
            first = Pusher(d).public_key
            self.assertEqual(Pusher(d).public_key, first)
            self.assertEqual(len(unb64u(first)), 65)

    def test_vapid_header_is_a_signed_jwt_for_the_push_service(self):
        import base64, json
        with tempfile.TemporaryDirectory() as d:
            p = Pusher(d)
            header = p._vapid_header("https://fcm.googleapis.com/fcm/send/abc")
            token = header.split("t=")[1].split(",")[0]
            claims = json.loads(unb64u(token.split(".")[1]))
            self.assertEqual(claims["aud"], "https://fcm.googleapis.com")
            self.assertIn(f"k={p.public_key}", header)
            self.assertEqual(len(unb64u(token.split(".")[2])), 64)


if __name__ == "__main__":
    unittest.main()
