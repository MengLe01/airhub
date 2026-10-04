package me.rerere.rikkahub.utils

import org.junit.Assert.assertEquals
import org.junit.Test

class CharacterCountTest {
    @Test
    fun `CJK characters count individually`() {
        assertEquals(2, "你好".characterCount())
    }

    @Test
    fun `ASCII characters count individually`() {
        assertEquals(3, "abc".characterCount())
        assertEquals(6, "hello!".characterCount())
    }

    @Test
    fun `mixed text counts every character`() {
        assertEquals(9, "你好 hello!".characterCount())
    }

    @Test
    fun `whitespace counts as characters`() {
        assertEquals(3, " \n\t".characterCount())
    }

    @Test
    fun `emoji code point counts as one character`() {
        assertEquals(1, "👋".characterCount())
        assertEquals(2, "👋，".characterCount())
    }

    @Test
    fun `markdown markers and code characters count as characters`() {
        assertEquals(8, "**bold**".characterCount())
        assertEquals(7, "`a`\n```".characterCount())
    }
}
